import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// One-off: the source sheet's NOTICE notes and screenshots → each game's วิธีเติม.
// Run on the server, from the app folder, in its own process:
//   node scripts/import-sheet-notices.mjs                 (dry run: shows what would be imported)
//   node scripts/import-sheet-notices.mjs --apply         (writes; games that already have a guide are skipped)
//   node scripts/import-sheet-notices.mjs --replace=3     (also replace game 3's existing guide; ids comma-separated)
//   node scripts/import-sheet-notices.mjs --retitle       (imported steps with no title get their note as the title)
// --replace and --retitle are dry runs too until --apply is added.
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");
const retitle = process.argv.includes("--retitle");
const replaceGameIds = (process.argv.find((arg) => arg.startsWith("--replace="))?.slice("--replace=".length) || "")
  .split(",").map((id) => Number(id.trim())).filter((id) => Number.isInteger(id) && id > 0);
const { importGameinfoSheetNotices, retitleGameinfoSheetNotices } = await import("../src/server/gameinfo-sheet-notices-import.js");
const actor = { id: null, name: "import-sheet-notices" };
const log = (line) => console.log(line);
try {
  const summary = retitle
    ? await retitleGameinfoSheetNotices({ apply, actor, log })
    : await importGameinfoSheetNotices({ apply, actor, replaceGameIds, log });
  const what = retitle
    ? `${summary.games} เกม, ${summary.steps} ข้อ`
    : `${summary.games} เกม, ${summary.steps} ข้อ, รูป ${summary.images}`;
  console.log(`\n${apply ? "บันทึกแล้ว" : "ลองดู (ยังไม่ได้เขียน)"}: ${what}${apply ? `, บันทึก ${summary.saved}, ล้มเหลว ${summary.failed}` : ""}`);
  if (!apply) console.log("ถ้าดูแล้วถูกต้อง รันอีกครั้งพร้อม --apply");
  process.exit(summary.failed ? 1 : 0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
