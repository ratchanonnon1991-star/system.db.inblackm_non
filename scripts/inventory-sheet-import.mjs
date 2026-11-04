// Import the account history of the Center / NP / SLY workbooks into the inventory ledger.
// One tab = one account from the channel registry CSV; its currency comes from there.
// Dry run by default; --apply writes to the tools database.
//
//   node scripts/inventory-sheet-import.mjs --registry inventory-channels-v5.csv "<folder>"
//   node scripts/inventory-sheet-import.mjs --registry inventory-channels-v5.csv "<folder>" --apply
//
// Give the current workbooks and the backup taken before the monthly clean together: rows in
// both are kept once. Rows a bot filled are left out (bot use is read from the bot database).
// Tabs not in the registry are listed, never registered here. Re-running replays, never doubles.
import "./register-app-alias.mjs";
import env from "@next/env";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const { readXlsxSheetsWithImages } = await import("../src/server/xlsx-reader.js");
const { importRowsFromCsv } = await import("./lib/inventory-ledger-import.mjs");
const { accountInput } = await import("../src/lib/inventory-ledger.js");
const { parseAccountWorkbook, mergeSnapshots, ledgerEntries, dropDebited, SKIPPED_WORKBOOK } = await import("./lib/inventory-sheet-import.mjs");

const args = process.argv.slice(2), apply = args.includes("--apply");
const registryAt = args.indexOf("--registry"), registryPath = registryAt >= 0 ? args[registryAt + 1] : null;
const paths = args.filter((a, i) => !a.startsWith("--") && i !== registryAt + 1);
if (!registryPath || !paths.length) { console.error('ใช้: node scripts/inventory-sheet-import.mjs --registry <ทะเบียน.csv> <โฟลเดอร์หรือ .xlsx> [--apply]'); process.exit(2); }

// Tabs get renamed with an extra space now and then; match names with spaces collapsed.
const spaces = (ref) => ref.replace(/\s+/g, " ");
const registry = new Map(importRowsFromCsv(readFileSync(registryPath, "utf8")).accounts.map((a) => [spaces(a.ref), a]));
const walk = (p) => statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : /\.xlsx$/i.test(p) && !basename(p).startsWith("~$") ? [p] : [];
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const mask = (s) => String(s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "<mail>").replace(/\d{5,}/g, "<num>");

const snapshots = new Map(), skipped = [];
let skippedFiles = 0;
for (const file of paths.flatMap(walk)) {
  if (SKIPPED_WORKBOOK.test(basename(file))) { skippedFiles++; continue; }
  const parsed = parseAccountWorkbook(readXlsxSheetsWithImages(readFileSync(file), { numbers: true }).sheets, basename(file), today);
  skipped.push(...parsed.skipped);
  for (const [ref, tab] of parsed.tabs) snapshots.set(spaces(ref), [...(snapshots.get(spaces(ref)) ?? []), tab.rows]);
}

const plan = [], unmatched = [];
for (const [ref, list] of snapshots) {
  const rows = mergeSnapshots(list);
  if (!rows.length) continue;
  const account = registry.get(ref);
  if (!account) { unmatched.push(`${mask(ref)} (${rows.length} แถว)`); continue; }
  plan.push({ account, key: accountInput(account).key, rows });
}

const byCategory = new Map(), reasons = new Map();
for (const { account, rows } of plan) {
  const c = byCategory.get(account.category) ?? { accounts: 0, deposit: 0, use: 0, adjust_in: 0, adjust_out: 0, blankUse: 0, first: "9999", last: "0000" };
  c.accounts++;
  for (const r of rows) { c[r.kind]++; if (r.kind === "use" && r.blankOperator) c.blankUse++; if (r.day < c.first) c.first = r.day; if (r.day > c.last) c.last = r.day; }
  byCategory.set(account.category, c);
}
// The backup and the current file report the same tab twice; count each place once.
for (const s of new Map(skipped.map((s) => [`${s.where}|${s.reason}`, s])).values()) { const k = s.reason.replace(/\(.*\)/, "").trim(); reasons.set(k, (reasons.get(k) ?? 0) + 1); }
const total = plan.reduce((n, p) => n + p.rows.length, 0);
console.log(`บัญชี ${plan.length} · รายการ ${total} · ไม่อยู่ในทะเบียน ${unmatched.length} แท็บ · ข้ามไฟล์ที่ไม่ใช่บัญชี ${skippedFiles}`);
for (const [cat, c] of [...byCategory].sort()) console.log(`  ${cat}: ${c.accounts} บัญชี · ใช้ ${c.use} (ไม่ระบุผู้เติม ${c.blankUse}) · เติมเข้า ${c.deposit} · ปรับเข้า ${c.adjust_in} · ปรับออก ${c.adjust_out} · ${c.first} ถึง ${c.last}`);
for (const [k, n] of reasons) console.log(`  ข้าม ${String(n).padStart(5)}  ${k}`);
for (const s of skipped.filter((s) => !/บอท/.test(s.reason)).slice(0, 30)) console.log(`    ${mask(s.where)}: ${mask(s.reason)}`);
for (const u of unmatched) console.log(`  ไม่อยู่ในทะเบียน: ${u}`);
// Coverage: registered accounts this run gives no history (other layouts, iTunes, closed tabs ...).
const imported = new Set(plan.map((p) => spaces(p.account.ref))), coverage = new Map();
for (const [ref, a] of registry) { const c = coverage.get(a.category) ?? { all: 0, missing: [] }; c.all++; if (!imported.has(ref)) c.missing.push(a.label); coverage.set(a.category, c); }
console.log(`\nความครอบคลุม: ทะเบียน ${registry.size} บัญชี · มีประวัติจากชีตชุดนี้ ${plan.length}`);
for (const [cat, c] of [...coverage].sort()) if (c.missing.length) console.log(`  ${cat}: ${c.all - c.missing.length}/${c.all} · ยังไม่มี: ${c.missing.slice(0, 6).map(mask).join(" | ")}${c.missing.length > 6 ? ` … อีก ${c.missing.length - 6}` : ""}`);

if (!apply) { console.log("\nยังไม่ได้บันทึก (dry run) ใส่ --apply เพื่อบันทึกจริง"); process.exit(0); }

const { inventoryLedger } = await import("../src/server/inventory-ledger.js");
const { getPool } = await import("../src/lib/db.js");
const actor = { id: 0, username: "inventory-sheet-import", permissions: ["projectm.admin"] };
const ledger = inventoryLedger(), ids = new Map();
let saved = 0, replayed = 0;
const failed = [];
try {
  // Registering is idempotent: accounts already in the registry keep their id.
  for (let i = 0; i < plan.length; i += 200) {
    for (const a of await ledger.registerAccounts(plan.slice(i, i + 200).map((p) => p.account), actor)) ids.set(a.key, a.id);
  }
  // Fills a person already recorded on the debit page (actor id 0 is an import script).
  const { rows: debitedRows } = await getPool().query(`SELECT e.account_id::text AS id, e.order_ref FROM gamedb_inv_entries e
    WHERE e.kind='use' AND e.actor_id <> 0 AND e.account_id = ANY($1::bigint[])
      AND NOT EXISTS (SELECT 1 FROM gamedb_inv_entries r WHERE r.reverses_entry_id = e.id)`, [[...ids.values()]]);
  const { kept: bodies, dropped } = dropDebited(plan.flatMap(({ key, rows }) => ledgerEntries(key, rows).map((b) => ({ ...b, accountId: ids.get(key) }))),
    new Set(debitedRows.map((r) => `${r.id}|${r.order_ref}`)));
  bodies.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  console.log(`ข้าม ${dropped} รายการที่ยกยอดผ่านหน้ายกยอดไว้แล้ว`);
  for (let i = 0; i < bodies.length; i += 200) {
    const batch = bodies.slice(i, i + 200);
    for (const r of await ledger.importEntries(batch, actor)) {
      if (!r.ok) failed.push(`${mask(batch[r.index].note.slice(0, 80))}: ${r.error}`);
      else if (r.replayed) replayed++; else saved++;
    }
    process.stdout.write(`\r  ${Math.min(i + 200, bodies.length)}/${bodies.length}`);
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
