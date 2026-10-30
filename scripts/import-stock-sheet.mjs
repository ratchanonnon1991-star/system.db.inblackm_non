import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// One-off: the 2.1 STOCK_ sheet's balances ("ตรวจสอบยอดคงเหลือ") → Stock.
// Run on the server, from the app folder:
//   node scripts/import-stock-sheet.mjs           (dry run: lists what would come in)
//   node scripts/import-stock-sheet.mjs --apply   (writes; accounts already in Stock are skipped)
// The sheet must be shared with the Google service account in ITUNE_SHEETS_CREDENTIALS.
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");
const { importStockSheet } = await import("../src/server/stock-sheet-import.js");
try {
  const summary = await importStockSheet({ apply, actor: { id: null, name: "ยกมาจากชีต 2.1 STOCK_" }, log: (line) => console.log(line) });
  console.log(`\n${apply ? "บันทึกแล้ว" : "ลองดู (ยังไม่ได้เขียน)"}: ${summary.accounts} ไอดี, ${summary.packs} แพ็ค, ต้องตรวจ ${summary.problems} แพ็ค, ข้าม ${summary.skipped} ไอดี`);
  if (!apply) console.log("ถ้าดูแล้วถูกต้อง รันอีกครั้งพร้อม --apply");
  process.exit(0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
