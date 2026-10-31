import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// One game's cost at one rate per wallet, as its sheet tab works it out
// (src/lib/gameinfo-channel-costs.js). Run on the server, from the app folder:
//   node scripts/set-channel-costs.mjs --game=3 --mode=idpass \
//     --rate="GOOGLE NGN=[Rate_NGN]:NGN" --rate="ITUNES(DE)=[Rate_Itune_DE]:EUR" --rate="ITUNES (USD)=[Rate_Itune_USD]:USD"
//   node scripts/set-channel-costs.mjs --game=3 --rate="Wavepay=1/[Rate_MMK]:MMK"
// [ชื่อ] follows a ตัวแปรผสม, so editing it later moves these packs' cost; a plain
// number fixes the rate. A dry run until --apply is added. --mode is uid or idpass (default uid).
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes("--apply");
const gameId = Number(arg("game"));
const mode = arg("mode") === "idpass" ? "idpass" : "uid";
const { applyGameinfoChannelCosts, gameinfoRateVariables, parseGameinfoChannelRate } = await import("../src/lib/gameinfo-channel-costs.js");
const { getGameinfoFormulaVariables } = await import("../src/server/gameinfo-formula-variables.js");
const { getGameinfoModeData, updateGameinfoModeData } = await import("../src/server/gameinfo-mode-data.js");
const { getGamelistPacks, saveGamelistPacks } = await import("../src/server/gameinfo-gamelist-packs.js");
const actor = { id: null, name: "set-channel-costs" };

try {
  if (!Number.isInteger(gameId) || gameId <= 0) throw new Error("ใส่ --game=<id ของเกม>");
  const rates = process.argv.filter((item) => item.startsWith("--rate=")).map((item) => parseGameinfoChannelRate(item.slice(7)));
  if (!rates.length) throw new Error('ใส่ --rate="ช่องทาง=เรท:สกุลเงิน" อย่างน้อยหนึ่งช่องทาง');
  const { variables } = await getGameinfoFormulaVariables(0);
  for (const { rateFormula } of rates) {
    const missing = gameinfoRateVariables(rateFormula).find((name) => !variables.some((variable) => variable.name === name));
    if (missing) throw new Error(`ไม่พบตัวแปรผสม [${missing}]`);
  }

  // Read the uid store first even for idpass: it readies the shared pack
  // tables, which an idpass save would otherwise ready from a second
  // connection while its own transaction holds them, and wait on itself.
  const uid = await getGamelistPacks(gameId);
  const current = mode === "idpass" ? (await getGameinfoModeData(gameId, mode)).packs : uid;
  const result = applyGameinfoChannelCosts(current, rates, undefined, variables);
  for (const pack of result.assigned) {
    const cost = Number(pack.amount) * pack.rate;
    console.log(`${pack.name} | ${pack.channel} | ${pack.amount} × ${pack.rate} = ${Number.isFinite(cost) ? cost.toFixed(2) : "-"}`);
  }
  for (const pack of result.unmatched) console.log(`ไม่มีเรท: ${pack.name} | ${pack.channel || "(ไม่มีช่องทาง)"}`);
  const formulaSet = result.packs.computedColumns !== current.computedColumns;
  console.log(`\nเกม ${gameId} (${mode}): ตั้งเรท ${result.assigned.length} แพ็ค, ไม่มีเรท ${result.unmatched.length} แพ็ค${formulaSet ? ", ตั้งสูตรต้นทุนของเกม" : ""}`);

  if (apply) {
    if (mode === "idpass") {
      await updateGameinfoModeData(gameId, mode, (data) => ({
        ...data,
        packs: applyGameinfoChannelCosts(data.packs, rates).packs,
      }), { area: "pack", actor });
    } else {
      await saveGamelistPacks(gameId, {
        currencies: result.packs.currencies,
        computedColumns: result.packs.computedColumns,
        costProfiles: result.packs.costProfiles,
        actor,
        source: "import",
        expectedVersion: current.version,
      });
    }
    console.log("บันทึกแล้ว");
  } else {
    console.log("ลองดู (ยังไม่ได้เขียน) — ถ้าถูกต้อง รันอีกครั้งพร้อม --apply");
  }
  process.exit(0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
