import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// One-off: the source sheet's NOTICE notes and screenshots → each game's วิธีเติม.
// Run on the server, from the app folder, in its own process:
//   node scripts/import-sheet-notices.mjs          (dry run: shows what would be imported)
//   node scripts/import-sheet-notices.mjs --apply  (writes; games that already have a guide are skipped)
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");
const { importGameinfoSheetNotices } = await import("../src/server/gameinfo-sheet-notices-import.js");
try {
  const summary = await importGameinfoSheetNotices({
    apply,
    actor: { id: null, name: "import-sheet-notices" },
    log: (line) => console.log(line),
  });
  console.log(`\n${apply ? "นำเข้าแล้ว" : "ลองดู (ยังไม่ได้เขียน)"}: ${summary.games} เกม, ${summary.steps} ข้อ, รูป ${summary.images}${apply ? `, บันทึก ${summary.saved}, ล้มเหลว ${summary.failed}` : ""}`);
  if (!apply) console.log("ถ้าดูแล้วถูกต้อง รันอีกครั้งพร้อม --apply");
  process.exit(summary.failed ? 1 : 0);
} catch (error) {
  console.error("นำเข้าไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
