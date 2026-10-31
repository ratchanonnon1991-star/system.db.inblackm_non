// Import the Razer Gold workbooks (all history) into the inventory ledger: one account
// per wallet (e-mail + zone), a deposit per "USD เข้า", a use per "USD ออก".
// Dry run by default; --apply writes to the tools database.
//
//   node scripts/razer-sheet-import.mjs "RAZER - ปี 2026"            (a folder or .xlsx files)
//   node scripts/razer-sheet-import.mjs "RAZER - ปี 2026" --apply
//
// Rows whose Razer transaction is already in razer_purchase_history (the bot's own
// fills) are left out, or the ledger check would count them twice. That needs
// PROFIT_DATABASE_URL (opened read-only); --no-bot-check skips it on purpose.
// Re-running is safe: every row has a fixed id, so rows already recorded are replayed.
import "./register-app-alias.mjs";
import env from "@next/env";
import pg from "pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const { readXlsxSheetsWithImages } = await import("../src/server/xlsx-reader.js");
const { parseRazerWorkbook, dropCopies, walletAccounts } = await import("./lib/razer-sheet-import.mjs");

const args = process.argv.slice(2), paths = args.filter(a => !a.startsWith("--"));
const apply = args.includes("--apply"), botCheck = !args.includes("--no-bot-check");
if (!paths.length) { console.error('ใช้: node scripts/razer-sheet-import.mjs <โฟลเดอร์หรือไฟล์ .xlsx> [--apply] [--no-bot-check]'); process.exit(2); }
if (botCheck && !process.env.PROFIT_DATABASE_URL) { console.error("ไม่พบ PROFIT_DATABASE_URL (ใส่ --no-bot-check ถ้าตั้งใจข้ามการเทียบกับบอท)"); process.exit(2); }

const walk = p => statSync(p).isDirectory() ? readdirSync(p).flatMap(n => walk(join(p, n))) : /\.xlsx$/i.test(p) && !basename(p).startsWith("~$") ? [p] : [];
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
let rows = [], skipped = [];
for (const file of paths.flatMap(walk)) {
  const parsed = parseRazerWorkbook(readXlsxSheetsWithImages(readFileSync(file), { numbers: true }).sheets, basename(file), today);
  rows.push(...parsed.rows); skipped.push(...parsed.skipped);
}
const { kept, copies } = dropCopies(rows);
skipped.push(...copies);
rows = kept;

if (botCheck) {
  const remote = new pg.Pool({ connectionString: process.env.PROFIT_DATABASE_URL, ssl: false, max: 1, connectionTimeoutMillis: 8000,
    options: "-c default_transaction_read_only=on -c statement_timeout=60000" });
  const refs = r => String(r.invoice ?? "").toUpperCase().split(/[\s/,]+/).filter(t => t.length >= 10);
  const all = [...new Set(rows.flatMap(refs))], bot = new Set();
  try {
    for (let i = 0; i < all.length; i += 1000) {
      const { rows: found } = await remote.query(`SELECT upper(razer_order_no) AS a, upper(transaction_id) AS b FROM razer_purchase_history
        WHERE status='completed' AND (upper(razer_order_no) = ANY($1::text[]) OR upper(transaction_id) = ANY($1::text[]))`, [all.slice(i, i + 1000)]);
      for (const f of found) { if (f.a) bot.add(f.a); if (f.b) bot.add(f.b); }
    }
  } finally { await remote.end(); }
  const byBot = new Set(rows.filter(r => r.kind === "use" && refs(r).some(t => bot.has(t))));
  skipped.push(...[...byBot].map(r => ({ where: `${r.file} / ${r.sheet} แถว ${r.row}`, reason: "บอทบันทึกไว้แล้ว" })));
  rows = rows.filter(r => !byBot.has(r));
}

const accounts = walletAccounts(rows), count = new Map(), reasons = new Map();
for (const r of rows) count.set(`${r.zone} ${r.kind}`, (count.get(`${r.zone} ${r.kind}`) ?? 0) + 1);
for (const s of skipped) { const k = s.reason.replace(/\(.*\)/, "").replace(/ซ้ำกับ .*/, "ซ้ำกับแท็บอื่น").trim(); reasons.set(k, (reasons.get(k) ?? 0) + 1); }
const days = rows.map(r => r.occurredAt.slice(0, 10)).sort();
console.log(`กระเป๋า ${accounts.length} · รายการ ${rows.length} (${days[0] ?? "-"} ถึง ${days.at(-1) ?? "-"}) · ข้าม ${skipped.length}${botCheck ? "" : " · ไม่ได้เทียบกับบอท"}`);
for (const [k, n] of [...count].sort()) console.log(`  ${String(n).padStart(6)}  ${k}`);
for (const [k, n] of reasons) console.log(`  ข้าม ${String(n).padStart(5)}  ${k}`);
for (const s of skipped.slice(0, 40)) console.log(`    ${s.where}: ${s.reason}`);
if (skipped.length > 40) console.log(`    ... อีก ${skipped.length - 40} แถว`);

if (!apply) { console.log("\nยังไม่ได้บันทึก (dry run) ใส่ --apply เพื่อบันทึกจริง"); process.exit(0); }

const { inventoryLedger } = await import("../src/server/inventory-ledger.js");
const { getPool } = await import("../src/lib/db.js");
const actor = { id: 0, username: "razer-sheet-import", permissions: ["projectm.admin"] };
const ledger = inventoryLedger(), ids = new Map();
let saved = 0, replayed = 0;
const failed = [];
try {
  for (let i = 0; i < accounts.length; i += 500) {
    for (const a of await ledger.registerAccounts(accounts.slice(i, i + 500), actor)) ids.set(a.key, a.id);
  }
  // Oldest first, sheet order within a day (sort is stable).
  const ordered = [...rows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (let i = 0; i < ordered.length; i += 200) {
    const batch = ordered.slice(i, i + 200);
    const bodies = batch.map(({ requestId, kind, amount, orderRef, invoice, thbAmount, saleThb, note, occurredAt, zone, email }) =>
      ({ requestId, kind, amount, orderRef, invoice, thbAmount, saleThb, note, occurredAt, accountId: ids.get(`razer:${zone}:${email}`) }));
    for (const r of await ledger.importEntries(bodies, actor)) {
      if (!r.ok) failed.push(`${batch[r.index].file} / ${batch[r.index].sheet} แถว ${batch[r.index].row}: ${r.error}`);
      else if (r.replayed) replayed++; else saved++;
    }
    process.stdout.write(`\r  ${Math.min(i + 200, ordered.length)}/${ordered.length}`);
  }
  console.log(`\nบันทึกแล้ว: ใหม่ ${saved} · มีอยู่แล้ว ${replayed} · ไม่สำเร็จ ${failed.length}`);
  for (const f of failed.slice(0, 40)) console.log(`  ${f}`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error(`\nนำเข้าไม่สำเร็จ: ${e.message}`);
  process.exitCode = 1;
} finally {
  await getPool().end().catch(() => {});
}
