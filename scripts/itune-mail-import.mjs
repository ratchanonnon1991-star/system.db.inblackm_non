// Add the iTune mails still usable in the 2.2 ITUNES workbook ("หน้ารวมเมล ITUNES") to the iTune
// page: balance left > 0, Status not Complete, no problem in Notice, not already in the system.
// Dry run by default; --apply writes. --as names the admin recorded as the one who added them.
//
//   node scripts/itune-mail-import.mjs "/tmp/2.2 ITUNES.xlsx" --as admin3324
//   node scripts/itune-mail-import.mjs "/tmp/2.2 ITUNES.xlsx" --as admin3324 --apply
//
// Emails and passwords are never printed. The sheet has no starting-balance photo, so imported
// mails have none (the page asks for one only when a mail is added by hand).
import "./register-app-alias.mjs";
import env from "@next/env";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const { readXlsxSheetsWithImages } = await import("../src/server/xlsx-reader.js");
const { parseItuneMailTab } = await import("./lib/itune-mail-import.mjs");

const args = process.argv.slice(2), apply = args.includes("--apply");
const asAt = args.indexOf("--as"), username = asAt >= 0 ? args[asAt + 1] : null;
const path = args.find((a, i) => !a.startsWith("--") && i !== asAt + 1);
if (!path || !username) { console.error('ใช้: node scripts/itune-mail-import.mjs "<2.2 ITUNES.xlsx>" --as <ชื่อผู้ใช้ admin> [--apply]'); process.exit(2); }

const sheet = readXlsxSheetsWithImages(readFileSync(path), { numbers: true, titles: new Set(["หน้ารวมเมล ITUNES"]) }).sheets[0];
if (!sheet) { console.error('ไม่พบแท็บ "หน้ารวมเมล ITUNES"'); process.exit(2); }
const { mails, skipped } = parseItuneMailTab(sheet);

const { listItuneEntries, insertItuneEntry } = await import("../src/server/itune-entries-repository.js");
const { findUserByUsername } = await import("../src/server/users-repository.js");
const { hasPermission } = await import("../src/lib/permissions.js");
const existing = new Set((await listItuneEntries({ all: true })).map((e) => String(e.email ?? "").trim().toLowerCase()));
const fresh = mails.filter((m) => !existing.has(m.email));

const reasons = new Map(), byCurrency = new Map();
for (const s of skipped) { const k = s.reason.replace(/\(.*\)/, "").trim(); reasons.set(k, (reasons.get(k) ?? 0) + 1); }
if (mails.length > fresh.length) reasons.set("มีในระบบแล้ว", mails.length - fresh.length);
for (const m of fresh) { const c = byCurrency.get(m.currency) ?? { n: 0, total: 0 }; c.n++; c.total += Number(m.amount); byCurrency.set(m.currency, c); }
console.log(`เมลที่จะเพิ่ม ${fresh.length} · ในระบบตอนนี้ ${existing.size}`);
for (const [c, v] of byCurrency) console.log(`  ${c}: ${v.n} เมล · ยอดรวม ${v.total.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
for (const [k, n] of reasons) console.log(`  ข้าม ${String(n).padStart(4)}  ${k}`);

if (!apply) { console.log("\nยังไม่ได้บันทึก (dry run) ใส่ --apply เพื่อบันทึกจริง"); process.exit(0); }

const actor = await findUserByUsername(username);
if (!actor || !hasPermission(actor, "projectm.admin")) { console.error(`ไม่พบผู้ใช้ ${username} หรือไม่มีสิทธิ์ Projectm Admin`); process.exit(2); }
let added = 0;
const failed = [];
for (const [i, m] of fresh.entries()) {
  try {
    await insertItuneEntry({ createdByUserId: actor.id, addedAt: m.addedAt, email: m.email, password: m.password, currency: m.currency,
      supplier: m.supplier, amount: m.amount, linkSms: m.linkSms, qna: "" }, actor);
    added++;
  } catch (e) { failed.push(`เมลลำดับ ${i + 1} (${m.currency}): ${e.message}`); }
}
console.log(`เพิ่มแล้ว ${added} · ไม่สำเร็จ ${failed.length}`);
for (const f of failed.slice(0, 30)) console.log(`  ${f}`);
process.exitCode = failed.length ? 1 : 0;
process.exit();
