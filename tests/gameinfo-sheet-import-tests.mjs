import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gameinfoSheetGameKey,
  normalizeGameinfoMarketResult,
  normalizeGameinfoSalesStatus,
  parseGameinfoMargin,
  parseGameinfoSourceSheet,
  sanitizeGameinfoSalesChannel,
} from "../src/lib/gameinfo-sales-channels.js";
import { gameinfoMissingItems } from "../src/lib/gameinfo-completeness.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

// Laid out like the real GAMELIST tab: headers with line breaks, a status
// column per channel followed by its "ราคาตลาด" column.
const gamelist = [
  ["Region MMK", "", "", "ช่องทางการเติม", "Region", "VPN / NO VPN", "Game", "ค่ายเกม", "ประเภทเกม", "ซ้ำ/ไม่ซ้ำ", "LINK", "Platform", "REGION", "หมายเหตุ", "หมายเหตุกำไร",
    "Inblackm\nMargin (%)", "Kaleoz\nMargin (%)", "Itemku\nMargin (%)", "Playerok\nMargin (%)", "G2G\nMargin (%)", "Russia\nMargin (%)",
    "PAGE", "ราคาตลาด", "Kaleoz", "ราคาตลาด", "G2G", "ราคาตลาด", "ITEMKU", "ราคาตลาด", "FUNPAY", "ราคาตลาด", "Player OK\nTopupman", "ราคาตลาด"],
  ["", "", "", "Ooredoo", "MMK", "NO VPN", "HONKAI IMPACT \n⚠️*ระวังเติมผิดBchip / Crystal*⚠️", "Mihoyo", "RPG & Gacha", "", "", "Mobile", "", "Auto UID", "",
    "8.79%", "8.79%", "", "", "19.39%", "",
    "เปิดขายแล้ว", "OFF", "เปิดขา่ยแล้ว", "ชนะทุกแพ็ค", "ปิดชั่วคราว", "OFF", "ไม่มีเกม", "", "", "", "กำลังลงสินค้า", "ชนะบางแพ็ค"],
  ["", "", "", "Razer", "USD", "VPN", "BLACK DESERT \nPC/CONSOLE (Razer Link)", "Pearl Abyss", "MMORPG"],
];
const onoff = [
  ["Region MMK"],
  ["", "", "", "", "", "", "PAGE", "KALEOZ", "RUSSIA", "ITEMKU"],
  ["⭐⭐⭐", "Bot Auto", "Ooredoo", "MMK", "NO VPN", "HONKAI IMPACT ", "OPEN", "OPEN", "OFF", "OPEN"],
  ["⭐⭐", "Manual", "Ooredoo", "MMK", "NO VPN", "DUMMY LAND", "DEL", "DEL", "DEL", "DEL"],
];
const games = parseGameinfoSourceSheet({ gamelist, onoff });
const honkai = games.find((game) => game.key === "honkai impact");
check(honkai && honkai.name === "HONKAI IMPACT", "the name is the first line, trimmed");
check(honkai.warning === "ระวังเติมผิดBchip / Crystal", "a ⚠️ line becomes the warning, without its markers");
check(honkai.publisher === "Mihoyo" && honkai.category === "RPG & Gacha" && honkai.remark === "Auto UID", "publisher, category and remark come from their columns");
check(honkai.channels.page.status === "open" && honkai.channels.page.market === "off" && honkai.channels.page.margin === 8.79, "PAGE status, market and Inblackm margin land on the page channel");
check(honkai.channels.kaleoz.status === "open" && honkai.channels.kaleoz.market === "win_all", "the sheet's misspelt เปิดขา่ยแล้ว still reads as open");
check(honkai.channels.g2g.status === "paused" && honkai.channels.g2g.margin === 19.39, "G2G status and margin");
check(honkai.channels.itemku.status === "none", "ไม่มีเกม reads as none, and the on/off tab does not override GAMELIST");
check(honkai.channels.russia.status === "closed", "Russia's status comes from the on/off tab");
check(honkai.channels.playerok_topupman.status === "listing" && honkai.channels.playerok_topupman.market === "win_some", "Playerok columns with a line break in the header");
const desert = games.find((game) => game.key === "black desert");
check(desert && desert.warning === "", "a second line without ⚠️ is part of the name, not a warning");
const dummy = games.find((game) => game.key === "dummy land");
check(dummy && dummy.channels.page.status === "removed", "a game only in the on/off tab still gets its channels (DEL = removed)");

check(gameinfoSheetGameKey("HONKAI IMPACT ") === gameinfoSheetGameKey("honkai  impact\nanything"), "names match ignoring case, spacing and later lines");
check(normalizeGameinfoSalesStatus("รอ verify") === "verify" && normalizeGameinfoSalesStatus("??") === "", "statuses map, unknown ones are dropped");
check(normalizeGameinfoMarketResult("แพ้ทุกแพ็ค") === "lose_all", "market results map");
check(parseGameinfoMargin("12.345%") === 12.35 && parseGameinfoMargin("") === null && parseGameinfoMargin("n/a") === null, "margins parse to two decimals or null");
check(sanitizeGameinfoSalesChannel({ channel: "shopee", status: "open" }) === null, "unknown channels are refused");

const complete = {
  row: { rankStars: 1, region: "MMK", platform: "Mobile", server: "GL", botManual: "Manual", image: "/x", tags: ["RPG"], publishers: ["Mihoyo"], links: [{}], hasTutorial: true },
  packs: [{ price: "1", channelsMain: ["A"], amountChargedFee: "1", costProfileId: "c" }],
  testIdCount: 3,
  linked: true,
  salesChannelCount: 2,
};
check(gameinfoMissingItems(complete).length === 0, "a complete game lacks nothing");
check(gameinfoMissingItems({ ...complete, salesChannelCount: 0, row: { ...complete.row, publishers: [] } }).map((item) => item.id).join() === "publishers,sales", "missing publisher and sales channels are listed");

const importer = readFileSync(new URL("../src/server/gameinfo-sheet-import.js", import.meta.url), "utf8");
check(importer.includes("createGoogleReader({ readOnly: true, exportAccess })") && importer.includes("const openReader = () => openGameinfoSheetReader();"), "the sheet is read with read-only scopes; web requests never get the export's Drive access");
const noticesImporter = readFileSync(new URL("../src/server/gameinfo-sheet-notices-import.js", import.meta.url), "utf8");
const routes = ["../src/app/api/gameinfo/sheet-import/route.js"].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
check(noticesImporter.includes("openGameinfoSheetReader({ exportAccess: true })") && routes.every((route) => !route.includes("notices")), "the workbook export runs only from the script, never in a web request");
check(importer.includes("const fills = proposalFor(sheetGame, {") && importer.includes("hasPublisher: publishers.length > 0"), "apply re-checks emptiness right before writing");
check(importer.includes("hasPacks: gameinfoHasRealPacks(packs.currencies)") && importer.includes("expectedVersion: packs.version") && importer.includes("gameinfoSheetCostFormulaColumns(packs.computedColumns, costProfiles) || packs.computedColumns"), "sheet packs only go into a game with no real packs, keep its formula columns and refuse a concurrent edit");

console.log(`${passed} passed`);
