import "./register-app-alias.mjs";
import env from "@next/env";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The accounting workbooks from Drive ("ข้อมูลบัญชี 2026": one folder per month,
// downloaded as .xlsx) → every tab kept row by row (Stock → ข้อมูลบัญชี), and the
// Bybit / BITKUB / Bitazza tabs of 1.2 → Stock wallet entries.
//   node scripts/import-account-sheets.mjs "<folder>"           dry run: what would come in
//   node scripts/import-account-sheets.mjs "<folder>" --apply   writes (each month and the
//                                                               sheet wallet entries are replaced)
// <folder> holds the "ข้อมูลบัญชี M-YYYY" folders (Drive → select the months → Download, unzip).
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");
const root = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!root) {
  console.error('ใส่โฟลเดอร์: node scripts/import-account-sheets.mjs "<โฟลเดอร์ที่มี ข้อมูลบัญชี M-YYYY>" [--apply]');
  process.exit(1);
}

const { readXlsxSheetsWithImages } = await import("../src/server/xlsx-reader.js");
const sheets = await import("../src/lib/account-sheets.js");

const colIndex = (letters) => [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1;
/** A sheet's cells → rows (index 0 = sheet row 1), each an array of text. */
function denseRows(cells) {
  const rows = [];
  for (const cell of cells) {
    const row = (rows[cell.row - 1] ||= []);
    row[colIndex(cell.col)] = cell.text;
  }
  return Array.from(rows, (row) => Array.from(row || [], (text) => text ?? ""));
}

const months = readdirSync(root)
  .filter((name) => statSync(join(root, name)).isDirectory() && sheets.sheetPeriod(name))
  .sort((a, b) => sheets.sheetPeriod(a).localeCompare(sheets.sheetPeriod(b)));
if (!months.length) {
  console.error("ไม่พบโฟลเดอร์ ข้อมูลบัญชี M-YYYY ในที่ที่ให้มา");
  process.exit(1);
}

const archive = [];
const walletTabs = [];
const skippedFiles = [];
let removedCells = 0;
for (const folder of months) {
  const period = sheets.sheetPeriod(folder);
  const files = [];
  for (const name of readdirSync(join(root, folder)).sort()) {
    if (!/\.xlsx$/i.test(name)) {
      skippedFiles.push(`${period} / ${name}`);
      continue;
    }
    const fileName = name.replace(/\.xlsx$/i, "");
    const book = readXlsxSheetsWithImages(readFileSync(join(root, folder, name)), { numbers: true });
    const tabs = [];
    for (const sheet of book.sheets) {
      const raw = denseRows(sheet.cells);
      const scrubbed = sheets.scrubSheetRows(raw);
      removedCells += scrubbed.removed;
      const code = sheets.walletCodeForTab(fileName, sheet.title);
      if (code) walletTabs.push({ code, period, tab: sheet.title, ...sheets.parseWalletTab(code, scrubbed.rows, period) });
      const rows = sheets.readableSheetRows(scrubbed.rows)
        .map((cells, index) => {
          const trimmed = [...cells];
          while (trimmed.length && !trimmed[trimmed.length - 1]) trimmed.pop();
          return { rowNo: index + 1, cells: trimmed };
        })
        .filter((row) => row.cells.some(Boolean));
      tabs.push({ tab: sheet.title, rows });
    }
    files.push({ fileName, tabs });
  }
  archive.push({ period, files });
}

const plan = sheets.planWalletEntries(walletTabs);
const entries = plan.entries.map((entry) => ({ ...entry, actorName: sheets.ACCOUNT_SHEET_ACTOR }));

for (const { period, files } of archive) {
  const tabs = files.reduce((n, file) => n + file.tabs.length, 0);
  const rows = files.reduce((n, file) => n + file.tabs.reduce((m, tab) => m + tab.rows.length, 0), 0);
  console.log(`${period}: ${files.length} ไฟล์, ${tabs} แท็บ, ${rows} แถว`);
}
const kinds = entries.reduce((acc, entry) => ({ ...acc, [entry.kind]: (acc[entry.kind] || 0) + 1 }), {});
console.log(`\nกระเป๋าเงิน: ${entries.length} รายการ`, kinds);
for (const tab of walletTabs) {
  if (tab.problems.length) console.log(`  ต้องดู ${tab.period} ${tab.tab}: ${tab.problems.length} แถว เช่น แถว ${tab.problems[0].rowNo} ${tab.problems[0].reason}`);
}
console.log("ยอดหลังนำเข้า:", plan.totals);
const drifts = plan.checks.filter((check) => check.drifts.length);
console.log(`ตรวจยอด: ${plan.checks.length} ช่อง (กระเป๋า×เดือน×สกุล), มีแถวที่ยอดในชีตไม่ต่อจากแถวบน ${drifts.length} ช่อง`);
if (plan.mismatches.length) {
  console.log(`ยอดในชีตไม่ต่อกัน ${plan.mismatches.length} จุด (ใส่เป็นรายการปรับยอดพร้อมเหตุผล):`);
  for (const m of plan.mismatches) console.log(`  ${m.period} ${m.code} ${m.currency} แถว ${m.rowNo}: ชีต ${m.sheet} / คำนวณ ${m.computed}`);
}
console.log(`ลบข้อมูลลับ (รหัสผ่าน/PIN) ออก ${removedCells} ช่อง`);
if (skippedFiles.length) console.log("ไม่ใช่ชีต ข้ามไป:", skippedFiles);

if (!apply) {
  console.log("\nลองดู (ยังไม่ได้เขียน) — ถ้าถูกต้อง รันอีกครั้งพร้อม --apply");
  process.exit(0);
}
try {
  const repo = await import("../src/server/account-sheet-repository.js");
  for (const { period, files } of archive) {
    const done = await repo.replaceAccountSheetMonth(period, files);
    console.log(`บันทึก ${period}: ${done.tabs} แท็บ ${done.rows} แถว`);
  }
  const wallets = await repo.replaceSheetWalletEntries(entries, plan.checks);
  console.log(`กระเป๋าเงิน: ลบของเดิมจากชีต ${wallets.removed}, ใส่ใหม่ ${wallets.added}, ตรวจยอด ${wallets.checks} ช่อง${wallets.walletsRemoved.length ? `, ลบกระเป๋าที่ไม่ใช้ ${wallets.walletsRemoved.join(", ")}` : ""}`);
  console.log("ยอดล่าสุด:", Object.entries(plan.totals).map(([k, v]) => `${k}=${v}`).join(", "));
  process.exit(0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
