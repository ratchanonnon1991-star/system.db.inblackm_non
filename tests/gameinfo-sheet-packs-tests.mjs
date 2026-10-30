import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createGoogleReader } from "../src/server/google-sheets.js";
import {
  applyGameinfoSheetStatusChanges,
  countGameinfoSheetPacks,
  findGameinfoSheetPackHeader,
  GAMEINFO_SHEET_COST_FORMULA,
  gameinfoSheetCostFormulaColumns,
  gameinfoSheetCostProfiles,
  gameinfoSheetMissingPacks,
  gameinfoSheetPackTree,
  gameinfoSheetPackNameColumns,
  gameinfoSheetPackUnits,
  gameinfoSheetStatusChanges,
  gameinfoSheetTone,
  parseGameinfoSheetPackTab,
  withGameinfoSheetTones,
} from "../src/lib/gameinfo-sheet-packs.js";
import { gameinfoHasRealPacks } from "../src/lib/gameinfo-pack-model.js";
import { evaluateGameinfoComputedColumn } from "../src/lib/gameinfo-computed-evaluator.js";
import { parseGameinfoSourceSheet } from "../src/lib/gameinfo-sales-channels.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

// Laid out like "U.HONKAI IMPACT(ASIA)": rate blocks on top, then the header,
// packs, a lone category label, more packs, and a repeated row.
const honkai = [
  ["", "Honkai Impact (UID)"],
  ["DATE", "27/10/2026", "", "Rate", "0.0081"],
  [""],
  ["ราคาขาย", "USDT", "KALEOZ", "B-Chips\nที่กด", "B-Chips รวม", "MMK ที่กด", "MMK รวม Fee", "LINK", "ช่องทาง", "ช่องทาง", "ระบบการเติม", "ต้นทุน", "กำไร\nที่ได้"],
  ["35", "0.99", "1.10", "60 B-Chips", "60", "4,500", "4,590", "https://shop.example/hi3", "Wavepay", "CODASHOP(MM)", "Auto", "37.2", "-2.2"],
  ["170", "4.99", "5.40", "300 B-Chips", "300", "22,000", "22,440", "", "CODASHOP(MM)", "ATOM", "Auto", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["MONTHLY CARD"],
  ["170", "4.99", "5.40", "Monthly Card", "", "22,000", "22,440", "", "ATOM", "", "", "", ""],
  ["170", "4.99", "5.40", "300 B-Chips", "300", "22,000", "22,440", "", "Wavepay", "", "", "", ""],
  ["", "", "", "Note: ไม่มีราคา", "", "", "", "", "", "", "", "", ""],
  ["เเก้บอท>>\nUID"],
];

check(findGameinfoSheetPackHeader(honkai) === 3, "the header is the row with ราคาขาย and a pack column");
const parsed = parseGameinfoSheetPackTab(honkai);
check(parsed.currencies.length === 1 && parsed.currencies[0].unit === "B-Chips", "the unit comes from the pack column's header, line break and all");
check(parsed.currencies[0].categories.map((category) => category.name).join("|") === "แพ็คหลัก|MONTHLY CARD", "the game title above the rate block is not a category; a lone label right above packs is");
check(countGameinfoSheetPacks(parsed) === 3, "the repeated name + price and the priceless row are skipped");
check(gameinfoSheetPackUnits(parsed) === "B-Chips", "units for the preview");
const first = parsed.currencies[0].categories[0].packs[0];
check(first.name === "60 B-Chips" && first.price === "35", "name and price");
check(first.amountChargedFee === "4590", "the fee-inclusive total wins over the plain amount, commas dropped");
check(first.channelsMain.join() === "Wavepay", "the wallet, not the store, from two plain ช่องทาง columns");
check(parsed.currencies[0].categories[0].packs[1].channelsMain.join() === "ATOM", "the store can come first; the wallet is still picked");
check(first.channelsSecondary.length === 0, "no สำรอง column, no secondary channel");
check(first.country === "Myanmar", "no ประเทศ column: the country follows the pressed currency");

// "Auto-chess": a bare unit column ("Donuts" + "Donuts รวม"), combo pack
// names, "ยอด MMK รวม FEE", and a link in the first ช่องทาง column.
const autoChess = [
  ["ราคาขาย", "ราคา USDT", "Kaleoz", "Donuts", "Donuts รวม", "ยอด MMK", "ยอด MMK\nรวม FEE", "ช่องทาง", "ช่องทาง", "ระบบการเติม", "ต้นทุน", "กำไรที่ได้"],
  ["", "", "", "", "", "", "", "", "", "", "", ""],
  ["135", "4.00", "135", "140+13 X 3", "459", "4400 X 3", "17688", "https://codashop.example/auto-chess", "Ooredoo", "Manual", "109.67", "25.33"],
];
const chess = parseGameinfoSheetPackTab(autoChess);
check(chess.currencies[0].unit === "Donuts", "a bare unit column followed by its รวม column is the pack column, not กำไรที่ได้");
const chessPack = chess.currencies[0].categories[0].packs[0];
check(chessPack.name === "140+13 X 3" && chessPack.amountChargedFee === "17688", "combo names stay; the ยอด … รวม FEE column is the amount");
check(chessPack.channelsMain.join() === "Ooredoo", "a link in a channel column is never the wallet");

// "8 Ball Pool": several tables, each under a label, one with a PACK column,
// a second route (ARS → MMK) for the same packs, numeric pack names.
const pool = [
  ["8 Ball Pool"],
  ["ต้นทุน MMK", "DATE", "MMK", "Rate"],
  ["Cash"],
  ["PAGE", "USDT", "Cash\nที่กด", "รวม", "ARS\nที่กด", "USD\nรวม", "ช่องทาง หลัก", "ช่องทาง สำรอง", "ประเทศ"],
  ["25", "0.7", "25", "25", "1,000", "1.10", "U9", "ATOM", ""],
  ["Coins"],
  ["PAGE", "USDT", "Coins\nที่กด", "รวม", "ARS\nที่กด", "USD\nรวม", "ช่องทาง หลัก", "ช่องทาง สำรอง", "ประเทศ"],
  ["30", "0.8", "5000", "5000", "1,200", "1.30", "U9", "", "Argentina"],
  ["Minigames"],
  ["PAGE", "USDT", "PACK", "ARS\nที่กด", "USD\nรวม", "ช่องทาง หลัก"],
  ["50", "1.4", "Spin Pack", "2,000", "2.10", "U9"],
  ["Cash"],
  ["PAGE", "USDT", "Cash\nที่กด", "รวม", "MMK ที่กด", "MMK รวม", "ช่องทาง หลัก"],
  ["25", "0.7", "25", "25", "4,000", "4,200", "Wavepay"],
];
const poolParsed = parseGameinfoSheetPackTab(pool);
check(poolParsed.currencies.map((currency) => currency.unit).join() === "Cash,Coins", "one currency per unit; the PACK table joins the first");
const cash = poolParsed.currencies[0];
check(cash.categories.map((category) => category.name).join("|") === "แพ็คหลัก|Minigames", "a label equal to the unit is the default category; other labels name theirs");
check(cash.categories[0].packs.length === 1 && cash.categories[0].packs[0].name === "25 Cash", "a numeric pack name gets its unit; the MMK route for the same pack is dropped");
check(cash.categories[0].packs[0].country === "Argentina" && cash.categories[0].packs[0].amountChargedFee === "1.10", "the country follows the pressed currency (ARS), the amount is the total");
check(cash.categories[0].packs[0].channelsMain.join() === "U9" && cash.categories[0].packs[0].channelsSecondary.join() === "ATOM", "ช่องทาง หลัก / สำรอง");
check(poolParsed.currencies[1].categories[0].packs[0].name === "5000 Coins", "the second table has its own unit");

// "PAGE" for the price, an explicit ประเทศหลัก, a fiat ที่กด before the pack column.
const shining = [
  ["PAGE", "LAK ที่กด", "Diamonds ที่ได้", "ช่องทาง หลัก", "ช่องทาง สำรอง", "ประเทศหลัก"],
  ["49", "30000", "60 Diamonds", "BCEL", "Unitel", "Laos"],
  ["0", "1000", "Free", "BCEL", "", "Laos"],
];
const shiningParsed = parseGameinfoSheetPackTab(shining);
check(shiningParsed.currencies[0].unit === "Diamonds", "a fiat ที่กด column is never the pack column");
const shiningPack = shiningParsed.currencies[0].categories[0].packs[0];
check(shiningPack.amountChargedFee === "30000" && shiningPack.channelsMain[0] === "BCEL" && shiningPack.channelsSecondary[0] === "Unitel" && shiningPack.country === "Laos", "PAGE price, หลัก/สำรอง channels and ประเทศหลัก are read");
check(countGameinfoSheetPacks(shiningParsed) === 1, "a zero price is not a pack");

check(parseGameinfoSheetPackTab([["ต้นทุน", "ค่าเงิน"], ["1", "2"]]) === null, "a tab without a pack table gives nothing");
check(parseGameinfoSheetPackTab([["ราคาขาย", "Jades ที่กด"], ["", ""]]) === null, "a header with no packs under it gives nothing");
check(findGameinfoSheetPackHeader([["ราคาขาย", "กำไร ที่ได้", "MMK ที่กด"]]) === -1, "money columns are never the pack column");

// Notes are not categories; VIP and price-comparison tables are not packs
// for sale; a table whose pack column we cannot find is not read with the
// previous table's columns; "ราคาขาย เพจ" is a price header.
const notes = parseGameinfoSheetPackTab([
  ["ต้องเปิด VPN ตามข้อมูลเติมเกม"],
  ["ราคาขาย\nเพจ", "K-Coinที่กด", "PHP\nที่กด", "ช่องทาง\nหลัก"],
  ["47", "103", "100", "GCASH"],
  ["ราคา VIP"],
  ["ราคาขาย\nเพจ", "K-Coinที่กด", "PHP\nที่กด", "ช่องทาง\nหลัก"],
  ["40", "103", "100", "GCASH"],
  ["Crystal"],
  ["ราคาขาย", "Crystal ที่กด", "ช่องทาง"],
  ["99", "300", "ATOM"],
  ["แพ๊คเสริมเทียบราคา"],
  ["ราคาขาย", "ราคาเต็ม THB", "UK\nที่กด", "ช่องทาง"],
  ["240", "Fairy Tale Pocket", "8", "ITUNES(DE)"],
]);
check(notes.currencies.map((currency) => currency.unit).join() === "K-Coin,Crystal", "a unit glued to ที่กด is read; a two-letter region is not a unit");
check(notes.currencies[0].categories.map((category) => category.name).join() === "แพ็คหลัก", "a note above a table is not a category");
check(countGameinfoSheetPacks(notes) === 2, "the VIP table and the comparison table are skipped, the table between them is not");
check(notes.currencies[0].categories[0].packs[0].price === "47", "ราคาขาย เพจ is the price column");
check(findGameinfoSheetPackHeader([["ราคาขาย", "Razer OTHER ที่กด"]]) === -1, "a Razer column is never the pack column");
check(findGameinfoSheetPackHeader([["ราคาขายเรท ", "USDT", "UC ที่กด", "IDR\nที่กด"]]) === 0, "ราคาขายเรท is a price header too");

// A bare title before the money columns names a table's packs.
const bare = parseGameinfoSheetPackTab([
  ["ราคาขาย", "Kaleoz", "USDT", "Gems ที่กด", "PHP ที่กด", "ช่องทาง"],
  ["30", "31", "0.9", "60", "49", "GCASH"],
  ["ราคาขาย", "Kaleoz", "USDT", "Growth Pack", "NOTICE", "PHP ที่กด", "Razer (SGD) ที่กด", "LINK การเติม", "ช่องทาง"],
  ["120", "126", "3.5", "Growth Fund I", "", "249", "5.9", "", "GCASH"],
]);
check(bare.currencies.length === 1 && bare.currencies[0].categories.map((category) => category.name).join() === "แพ็คหลัก,Growth Pack", "a bare title column joins the tab's currency as a category of its own");
check(bare.currencies[0].categories[1].packs[0].name === "Growth Fund I" && bare.currencies[0].categories[1].packs[0].amountChargedFee === "249", "its packs keep their names");
check(findGameinfoSheetPackHeader([["ราคาขาย", "DATE", "Rate", "MMK ที่กด"]]) === -1, "rate-block words are not pack titles");

const shop = parseGameinfoSheetPackTab([
  ["."],
  ["ราคาขาย", "USDT", "Monthly Kit Shop ที่กด", "USD ที่ออก", "ช่องทาง หลัก", "สำรอง"],
  ["99", "2.9", "Monthly Kit", "2.99", "Razer (SGD)", "GCASH"],
]);
const shopPack = shop.currencies[0].categories[0].packs[0];
check(shop.currencies[0].categories[0].name === "แพ็คหลัก", "a label with no letters is not a category");
check(shopPack.amountChargedFee === "2.99" && shopPack.channelsSecondary.join() === "GCASH", "USD ที่ออก is an amount; a bare สำรอง after ช่องทาง หลัก is the secondary channel");

const { currencies, costProfiles: poolProfiles } = gameinfoSheetPackTree(poolParsed);
check(currencies.length === 2 && currencies[0].name === "Cash", "one GameInfo currency per unit");
const tree = currencies[0].categories[0].packs[0];
check(tree.id && tree.name === "25 Cash" && tree.serviceEnabled !== undefined, "packs are full GameInfo packs with ids");
check(!("cost" in tree) && !("costCurrency" in tree), "the sheet's cost does not travel on the pack itself");
check(poolProfiles.length === 0 && tree.costProfileId === "", "no ต้นทุน column, no cost profile");

// ต้นทุน ÷ amount gives each cost currency its rate; GameInfo derives cost and profit from it.
const hiProfiles = gameinfoSheetCostProfiles(parsed, "2026-10-27T00:00:00.000Z");
check(hiProfiles.length === 1 && hiProfiles[0].id === "sheet-mmk" && hiProfiles[0].inputCurrency === "MMK", "one profile per cost currency");
check(hiProfiles[0].baseValue === String(Number((37.2 / 4590).toPrecision(6))), "the rate is the sheet's cost over the amount, packs without a cost left out");
const hiTree = gameinfoSheetPackTree(parsed);
check(hiTree.currencies[0].categories.every((category) => category.packs.every((pack) => pack.costProfileId === "sheet-mmk")), "every pack with an amount points at its currency's profile");
const razer = gameinfoSheetCostProfiles(parseGameinfoSheetPackTab([
  ["ราคาขาย", "Gems ที่กด", "Razer SGD ที่กด", "ต้นทุน"],
  ["30", "60", "1", "24"],
  ["60", "120", "2", "50"],
  ["90", "180", "3", "72"],
]));
check(razer[0].label.startsWith("Razer SGD") && razer[0].inputCurrency === "SGD" && razer[0].baseValue === "24", "Razer amounts get their own profile; the median rate ignores the odd row");
check(gameinfoHasRealPacks(currencies), "imported packs count as real packs");
check(!gameinfoHasRealPacks([{ categories: [{ packs: [{ id: "p1", name: "", price: "" }] }] }]), "an empty placeholder pack is not a real pack");
check(!gameinfoHasRealPacks([]), "no currencies, no packs");

// Imported games get a ต้นทุน formula of their own, so cost matches the sheet.
const columns = [{ key: "cost", label: "ต้นทุน", formula: "[ยอดที่กด + fee]/134.02", gameFormula: "" }, { key: "profit", label: "กำไร", formula: "[ราคา]-[ต้นทุน]", gameFormula: "" }];
const usd = gameinfoSheetCostFormulaColumns(columns, [{ id: "sheet-usd", inputCurrency: "USD" }, { id: "sheet-mmk", inputCurrency: "MMK" }]);
check(usd[0].gameFormula === GAMEINFO_SHEET_COST_FORMULA && usd[0].formula === columns[0].formula && usd[1] === columns[1], "a game with sheet profiles computes ต้นทุน from them; the shared formula and other columns stay");
check(gameinfoSheetCostFormulaColumns(columns, [{ id: "sheet-mmk", inputCurrency: "MMK" }])[0].gameFormula === GAMEINFO_SHEET_COST_FORMULA, "an MMK game uses the sheet's own MMK rate too");
const usdPack = { id: "p1", name: "110 Cash", price: "70", amountChargedFee: "0.62", costProfileId: "sheet-usd" };
const usdContext = { costProfiles: [{ id: "sheet-usd", label: "USD → THB (จากชีต)", inputCurrency: "USD", baseValue: "34.8495", rateFormula: "" }] };
check(evaluateGameinfoComputedColumn(usd[0], usd, usdPack, {}, usdContext) === 21.61, "0.62 USD at 34.8495 costs 21.61 baht");
check(evaluateGameinfoComputedColumn(usd[1], usd, usdPack, {}, usdContext) === 48.39, "and the profit follows: 70 − 21.61");
check(gameinfoSheetCostFormulaColumns(columns, [{ id: "manual", inputCurrency: "USD" }]) === null, "profiles an admin made are not the import's business");
check(gameinfoSheetCostFormulaColumns([{ ...columns[0], gameFormula: "[ยอดที่กด + fee]*35" }], [{ id: "sheet-usd", inputCurrency: "USD" }]) === null, "a formula the game already has is never replaced");

// GAMELIST's LINK column gives each game's tab.
const games = parseGameinfoSourceSheet({
  gamelist: [
    ["Game", "LINK"],
    ["HONKAI IMPACT", "https://docs.google.com/spreadsheets/d/192Yosw/edit#gid=627518256"],
    ["AUTO CHESS", "https://docs.google.com/spreadsheets/d/192Yosw/edit?gid=215079588#gid=215079588"],
    ["NO LINK", ""],
  ],
});
check(games.find((game) => game.key === "honkai impact").tabGid === 627518256, "a #gid= link gives the tab");
check(games.find((game) => game.key === "auto chess").tabGid === 215079588, "a ?gid= link gives the tab");
check(games.find((game) => game.key === "no link").tabGid === null, "no link, no tab");

// The reader: tabs with their gids, 20 tabs per batchGet, and a 429 waited out.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const urls = [];
const waits = [];
let throttled = 1;
const reader = createGoogleReader({
  keyFile: "/test/key.json",
  readOnly: true,
  readKeyFile: async () => JSON.stringify({ client_email: "fixture@example.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
  wait: async (ms) => { waits.push(ms); },
  fetchImpl: async (url) => {
    if (url.includes("oauth2")) return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) };
    urls.push(url);
    if (url.includes("batchGet") && throttled-- > 0) return { ok: false, status: 429, json: async () => ({ error: { message: "Quota exceeded" } }) };
    if (url.includes("batchGet")) {
      const ranges = new URL(url).searchParams.getAll("ranges");
      return { ok: true, status: 200, json: async () => ({ valueRanges: ranges.map((range) => ({ range, values: [[range]] })) }) };
    }
    return { ok: true, status: 200, json: async () => ({ sheets: [{ properties: { title: "GAMELIST", sheetId: 0 } }, { properties: { title: "U.HONKAI", sheetId: 627518256 } }] }) };
  },
});
const tabs = await reader.tabs("sheet");
check(tabs[1].title === "U.HONKAI" && tabs[1].gid === 627518256, "tabs come with their gids");
const titles = Array.from({ length: 25 }, (_, i) => `U.GAME ${i}'s`);
const byTab = await reader.batchRows("sheet", titles);
check(Object.keys(byTab).length === 25 && byTab[titles[24]][0][0] === "'U.GAME 24''s'!A:ZZ", "every tab's rows come back under its title, quotes escaped");
check(urls.filter((url) => url.includes("batchGet")).length === 3 && waits.join() === "20000", "25 tabs take two batchGets; a 429 is waited out and retried");

// Row marks: bright red = the pack expired in the game, bright green = new.
// The colours "U.LOVE AND DEEPSPACE" and "U.AFK JOURNEY" decorate with are not marks.
const rgb = (hex) => Object.fromEntries(["red", "green", "blue"].map((key, i) => [key, parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255]).filter(([, value]) => value > 0));
check(gameinfoSheetTone(rgb("ff0000")) === "red" && gameinfoSheetTone(rgb("ee1111")) === "red", "bright red is the expired mark");
check(gameinfoSheetTone(rgb("00ff00")) === "green" && gameinfoSheetTone(rgb("22ee22")) === "green", "bright green is the new mark");
check(["990000", "cc0000", "e06666", "e6b8af", "f4cccc", "b6d7a8", "d9ead3", "93c47d", "fce5cd", "ffffff", "000000", "fff2cc", "cfe2f3"].every((hex) => gameinfoSheetTone(rgb(hex)) === "") && gameinfoSheetTone(null) === "",
  "dark red, pink, pale green, peach, white, black, yellow and blue decorate: no status");

const toned = parseGameinfoSheetPackTab(honkai);
check(gameinfoSheetPackNameColumns(toned).join() === "3", "colours are read from the pack-name column");
// Row 4 (60 B-Chips) red, row 5 (300 B-Chips) green, row 8 (Monthly Card) white.
const nameColumn = [];
nameColumn[4] = rgb("ff0000");
nameColumn[5] = rgb("00ff00");
nameColumn[8] = rgb("ffffff");
withGameinfoSheetTones(toned, { 3: nameColumn });
const tonedPacks = toned.currencies.flatMap((currency) => currency.categories.flatMap((category) => category.packs));
check(tonedPacks.map((pack) => `${pack.name}:${pack.tone}`).join() === "60 B-Chips:red,300 B-Chips:green,Monthly Card:", "each pack takes its row's colour");
const tonedTree = gameinfoSheetPackTree(toned).currencies.flatMap((currency) => currency.categories.flatMap((category) => category.packs));
check(tonedTree.map((pack) => `${pack.serviceEnabled}/${pack.serviceStatus}`).join() === "false/expired,true/new,true/", "an import brings red rows in expired and green rows new");
check(tonedTree.every((pack) => !("sheetRow" in pack) && !("tone" in pack)), "the sheet position and colour are not stored on the pack");

const gameTree = [{ id: "c", categories: [{ id: "cat", packs: [
  { id: "a", name: "60  b-chips", serviceEnabled: true, serviceStatus: "" },
  { id: "b", name: "300 B-Chips", serviceEnabled: false, serviceStatus: "" },
  { id: "c", name: "Monthly Card", serviceEnabled: true, serviceStatus: "new" },
  { id: "d", name: "Only in GameInfo", serviceEnabled: true, serviceStatus: "" },
] }] }];
const changes = gameinfoSheetStatusChanges(gameTree, toned);
check(changes.map((change) => `${change.packId}:${change.from}>${change.to}`).join() === "a:open>expired,c:new>open", "red expires, an uncoloured row ends ใหม่, green does not reopen a pack closed by hand");
const changed = applyGameinfoSheetStatusChanges(gameTree, changes)[0].categories[0].packs;
check(changed[0].serviceEnabled === false && changed[0].serviceStatus === "expired" && changed[2].serviceStatus === "" && changed[3] === gameTree[0].categories[0].packs[3], "only the named packs change");
check(gameinfoSheetStatusChanges(applyGameinfoSheetStatusChanges(gameTree, changes), toned).length === 0, "a second run changes nothing");
const twoWays = parseGameinfoSheetPackTab(honkai);
withGameinfoSheetTones(twoWays, { 3: nameColumn });
twoWays.currencies[0].categories[0].packs.push({ name: "60 B-Chips", tone: "green" });
check(!gameinfoSheetStatusChanges(gameTree, twoWays).some((change) => change.packId === "a"), "a name coloured two ways is left alone");
const missing = gameinfoSheetMissingPacks(toned, [[{ categories: [{ packs: [{ name: "60 B-Chips" }] }] }]]);
check(missing.map((row) => `${row.name}:${row.tone}`).join() === "300 B-Chips:green,Monthly Card:", "every sheet pack with no pack of that name is listed, coloured or not");
check(missing[1].price === "170" && missing[1].channel === "ATOM", "with its price and wallet, to find it in the sheet");

// columnColors: one A1 column range per wanted column, grouped back by tab title.
const colorUrls = [];
const colorReader = createGoogleReader({
  keyFile: "/test/key.json",
  readOnly: true,
  readKeyFile: async () => JSON.stringify({ client_email: "fixture@example.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
  fetchImpl: async (url) => {
    if (url.includes("oauth2")) return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) };
    colorUrls.push(url);
    return { ok: true, status: 200, json: async () => ({ sheets: [{ properties: { title: "U.PES" }, data: [
      { startColumn: 3, rowData: [{}, { values: [{ effectiveFormat: { backgroundColor: { red: 1 } } }] }] },
      { startColumn: 27, rowData: [{ values: [{ effectiveFormat: { backgroundColor: { green: 1 } } }] }] },
    ] }] }) };
  },
});
const colors = await colorReader.columnColors("sheet", [{ tab: "U.PES", cols: [3, 27] }]);
check(new URL(colorUrls[0]).searchParams.getAll("ranges").join() === "'U.PES'!D:D,'U.PES'!AB:AB", "columns are asked for as A1 ranges");
check(colors["U.PES"][3][0] === null && colors["U.PES"][3][1].red === 1 && colors["U.PES"][27][0].green === 1, "colours come back by tab, column and row");

console.log(`gameinfo-sheet-packs: ${passed} passed`);
