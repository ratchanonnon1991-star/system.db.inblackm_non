import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// One-off: the last of bringing LOVE AND DEEPSPACE in line with its sheet tab.
// Adds this game's KALEOZ 5% and G2G columns (hidden from the Topup view),
// renames "60 crystal" so the sheet's details reach it, corrects the UID source
// note, and clears ID-PASS's กำไร if it still has the old rate written into it.
// Run on the server, from the app folder:
//   node scripts/finish-love-and-deepspace.mjs           (dry run)
//   node scripts/finish-love-and-deepspace.mjs --apply
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");
const GAME_ID = 3;
const UID_SOURCE = "Page / Market Place";
const OLD_PACK_NAME = "60 crystal";
const NEW_PACK_NAME = "60 Crystals";
const PROFIT_FORMULA = "[ราคา]-[ต้นทุน]";

const { withGameinfoSheetColumns } = await import("../src/lib/gameinfo-sheet-columns.js");
const { getGamelistPacks, saveGamelistPacks } = await import("../src/server/gameinfo-gamelist-packs.js");
const { getGameinfoModeData, updateGameinfoModeData } = await import("../src/server/gameinfo-mode-data.js");
const { getGamelistGameSettings, saveGamelistGameSettings } = await import("../src/server/gameinfo-game-settings.js");
const { listGameinfoColumnRoleRules, saveGameinfoColumnRoleRules } = await import("../src/server/gameinfo-column-roles.js");
const { fillGameinfoSheetPackDetails } = await import("../src/server/gameinfo-sheet-import.js");
const actor = { id: null, name: "finish-love-and-deepspace" };

// Only a formula with a rate written into it; one someone set to anything else is theirs.
const fixedProfit = (columns) => (columns || []).map((column) => (
  String(column.label ?? "").trim() === "กำไร" && /\/\s*1\d\d(\.\d+)?/.test(String(column.gameFormula ?? ""))
    ? { ...column, gameFormula: PROFIT_FORMULA }
    : column
));

try {
  // Read the uid store first: it readies the shared pack tables an idpass save needs.
  const uid = await getGamelistPacks(GAME_ID);
  const renames = uid.currencies.flatMap((currency) => currency.categories.flatMap((category) => category.packs))
    .filter((pack) => pack.name === OLD_PACK_NAME).length;
  const { columns, added, keys } = withGameinfoSheetColumns(uid.computedColumns);
  const settings = await getGamelistGameSettings(GAME_ID);
  const idpass = await getGameinfoModeData(GAME_ID, "idpass");
  const profitFix = JSON.stringify(fixedProfit(idpass.packs.computedColumns)) !== JSON.stringify(idpass.packs.computedColumns);
  const rules = await listGameinfoColumnRoleRules();
  const hidden = rules.filter((rule) => rule.role === "topup" && Number(rule.gameId) === 0 && rule.visible === false).map((rule) => rule.columnKey);
  const toHide = keys.filter((key) => !hidden.includes(key));

  console.log(`คอลัมน์ใหม่: ${added.join(", ") || "มีครบแล้ว"}`);
  console.log(`ซ่อนจากมุมมอง Topup: ${toHide.length} คอลัมน์`);
  console.log(`เปลี่ยนชื่อ ${OLD_PACK_NAME} → ${NEW_PACK_NAME}: ${renames} แพ็ค`);
  console.log(`แหล่งที่มา UID: ${settings.sourceUid || "(ว่าง)"} → ${UID_SOURCE}`);
  console.log(`สูตรกำไร ID-PASS: ${profitFix ? `เปลี่ยนเป็น ${PROFIT_FORMULA}` : "ถูกแล้ว"}`);

  if (!apply) {
    console.log("\nลองดู (ยังไม่ได้เขียน) — ถ้าถูกต้อง รันอีกครั้งพร้อม --apply");
    process.exit(0);
  }

  if (added.length || renames) {
    await saveGamelistPacks(GAME_ID, {
      currencies: uid.currencies.map((currency) => ({
        ...currency,
        categories: currency.categories.map((category) => ({
          ...category,
          packs: category.packs.map((pack) => (pack.name === OLD_PACK_NAME ? { ...pack, name: NEW_PACK_NAME } : pack)),
        })),
      })),
      computedColumns: columns,
      costProfiles: uid.costProfiles,
      actor,
      source: "import",
      expectedVersion: uid.version,
    });
  }
  if (toHide.length) await saveGameinfoColumnRoleRules({ role: "topup", hiddenColumnKeys: [...hidden, ...toHide] });
  if (settings.sourceUid !== UID_SOURCE) await saveGamelistGameSettings(GAME_ID, { sourceUid: UID_SOURCE }, actor);
  if (profitFix) {
    await updateGameinfoModeData(GAME_ID, "idpass", (data) => ({
      ...data,
      packs: { ...data.packs, computedColumns: fixedProfit(data.packs.computedColumns) },
    }), { area: "pack", actor });
  }
  console.log("บันทึกแล้ว");
  // The renamed pack can now take its details from the sheet.
  const filled = await fillGameinfoSheetPackDetails({ gameIds: [GAME_ID], apply: true, actor, log: (line) => console.log(line) });
  console.log(`เติมจากชีต: ${filled.packs} แพ็ค, ไม่สำเร็จ ${filled.failed} เกม`);
  process.exit(filled.failed ? 1 : 0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
