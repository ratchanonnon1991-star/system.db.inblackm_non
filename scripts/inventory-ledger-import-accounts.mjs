// Register debit-page accounts from the channel registry CSV (one row per account tab of
// the "Center" workbooks). Dry run by default; --apply writes to the tools database.
//
//   node scripts/inventory-ledger-import-accounts.mjs inventory-channels-draft-v2.csv
//   node scripts/inventory-ledger-import-accounts.mjs inventory-channels-draft-v2.csv --apply
//
// CSV columns: ไฟล์, แท็บ (บัญชี/ช่องทาง), สกุลเงิน (เดา), จำนวนแถวในแท็บ, สถานะในชื่อแท็บ
// Re-running is safe: an account that already exists is left as it is (its group is refreshed).
import "./register-app-alias.mjs";
import env from "@next/env";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const { importRowsFromCsv } = await import("./lib/inventory-ledger-import.mjs");

const [path, ...flags] = process.argv.slice(2);
if (!path) { console.error("ใช้: node scripts/inventory-ledger-import-accounts.mjs <csv> [--apply]"); process.exit(2); }
const { accounts, skipped } = importRowsFromCsv(readFileSync(path, "utf8"));
const byGroup = new Map();
for (const a of accounts) byGroup.set(a.category, (byGroup.get(a.category) ?? 0) + 1);
console.log(`บัญชีที่จะนำเข้า ${accounts.length} (ปิดใช้งาน ${accounts.filter(a => a.status === "disabled").length}) · ข้าม ${skipped.length} แถว`);
for (const [g, n] of byGroup) console.log(`  ${String(n).padStart(4)}  ${g}`);
for (const s of skipped.slice(0, 20)) console.log(`  ข้าม: ${s}`);

if (!flags.includes("--apply")) {
  console.log("\nยังไม่ได้บันทึก (dry run) ใส่ --apply เพื่อบันทึกจริง");
  process.exit(0);
}
const { inventoryLedger } = await import("../src/server/inventory-ledger.js");
const { getPool } = await import("../src/lib/db.js");
const actor = { id: 0, username: "import-script", permissions: ["projectm.admin"] };
let created = 0, existing = 0;
try {
  for (let i = 0; i < accounts.length; i += 200) {
    const result = await inventoryLedger().registerAccounts(accounts.slice(i, i + 200), actor);
    created += result.filter(r => r.created).length; existing += result.filter(r => !r.created).length;
  }
  console.log(`\nบันทึกแล้ว: สร้างใหม่ ${created} · มีอยู่แล้ว ${existing}`);
} catch (e) {
  console.error(`นำเข้าไม่สำเร็จ: ${e.message}`);
  process.exitCode = 1;
} finally {
  await getPool().end().catch(() => {});
}
