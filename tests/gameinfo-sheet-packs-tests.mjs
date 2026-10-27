import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createGoogleReader } from "../src/server/google-sheets.js";
import {
  countGameinfoSheetPacks,
  findGameinfoSheetPackHeader,
  gameinfoSheetPackCurrencies,
  gameinfoSheetPackUnits,
  parseGameinfoSheetPackTab,
} from "../src/lib/gameinfo-sheet-packs.js";
import { gameinfoHasRealPacks } from "../src/lib/gameinfo-pack-model.js";
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

const currencies = gameinfoSheetPackCurrencies(poolParsed);
check(currencies.length === 2 && currencies[0].name === "Cash", "one GameInfo currency per unit");
const tree = currencies[0].categories[0].packs[0];
check(tree.id && tree.name === "25 Cash" && tree.serviceEnabled !== undefined, "packs are full GameInfo packs with ids");
check(gameinfoHasRealPacks(currencies), "imported packs count as real packs");
check(!gameinfoHasRealPacks([{ categories: [{ packs: [{ id: "p1", name: "", price: "" }] }] }]), "an empty placeholder pack is not a real pack");
check(!gameinfoHasRealPacks([]), "no currencies, no packs");

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

console.log(`gameinfo-sheet-packs: ${passed} passed`);
