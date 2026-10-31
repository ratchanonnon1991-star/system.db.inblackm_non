import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// Fills what the "1.1 ข้อมูลเติมเกม UID" sheet knows and existing packs leave
// blank: จำนวนที่ได้, ยอดที่กดก่อน fee, USD and ลิงก์. Packs match by name, per mode, and
// nothing a pack already has is touched. Run on the server, from the app folder:
//   node scripts/fill-sheet-pack-details.mjs              (dry run, every game)
//   node scripts/fill-sheet-pack-details.mjs --game=3     (dry run, one game)
//   node scripts/fill-sheet-pack-details.mjs --apply
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");
const gameId = Number(process.argv.find((item) => item.startsWith("--game="))?.slice(7)) || null;
const { fillGameinfoSheetPackDetails } = await import("../src/server/gameinfo-sheet-import.js");

try {
  const summary = await fillGameinfoSheetPackDetails({
    gameIds: gameId ? [gameId] : null,
    apply,
    actor: { id: null, name: "fill-sheet-pack-details" },
    log: (line) => console.log(line),
  });
  console.log(`\n${apply ? "บันทึกแล้ว" : "ลองดู (ยังไม่ได้เขียน)"}: ${summary.games} เกม, ${summary.packs} แพ็ค, ไม่สำเร็จ ${summary.failed} เกม`);
  if (!apply) console.log("ถ้าถูกต้อง รันอีกครั้งพร้อม --apply");
  process.exit(summary.failed ? 1 : 0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
