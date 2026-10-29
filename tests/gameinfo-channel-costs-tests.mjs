import assert from "node:assert/strict";
import { applyGameinfoChannelCosts, gameinfoChannelKey, parseGameinfoChannelRate } from "../src/lib/gameinfo-channel-costs.js";
import { GAMEINFO_SHEET_COST_FORMULA } from "../src/lib/gameinfo-sheet-packs.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

check(gameinfoChannelKey("ITUNES (USD)") === gameinfoChannelKey("ITUNES(USD)"), "spacing and brackets do not split a wallet");
const ngn = parseGameinfoChannelRate("GOOGLE NGN=0.024037:NGN");
check(ngn.channel === "GOOGLE NGN" && ngn.rate === "0.024037" && ngn.currency === "NGN", "a rate reads as wallet, THB rate and currency");
assert.throws(() => parseGameinfoChannelRate("GOOGLE NGN"), /อ่านเรทไม่ออก/);
passed += 1;
assert.throws(() => parseGameinfoChannelRate("GOOGLE NGN=0"), /อ่านเรทไม่ออก/);
passed += 1;

const pack = (name, channel, amount) => ({ id: name, name, amountChargedFee: amount, channelsMain: channel ? [channel] : [], costProfileId: "" });
const packs = {
  currencies: [{ id: "c1", name: "Google", categories: [{ id: "k1", name: "PACK", packs: [pack("LV.10", "GOOGLE NGN", "1070"), pack("Odd", "WAVEPAY", "10")] }] },
    { id: "c2", name: "Itunes", categories: [{ id: "k2", name: "PACK", packs: [pack("Weekly Home", "ITUNES(DE)", "1.49"), pack("Crates", "ITUNES (USD)", "12.49")] }] }],
  computedColumns: [{ key: "cost", label: "ต้นทุน", formula: "[ยอดที่กด + fee] / 134.02", gameFormula: "" }],
  costProfiles: [{ id: "keep", label: "เดิม", baseValue: "1" }, { id: "sheet-itunesde", label: "เก่า", baseValue: "1" }],
};
const rates = ["GOOGLE NGN=0.024037:NGN", "ITUNES(DE)=26.13:EUR", "ITUNES(USD)=28.57:USD"].map(parseGameinfoChannelRate);
const result = applyGameinfoChannelCosts(packs, rates, "2026-10-29T00:00:00.000Z");
const all = result.packs.currencies.flatMap((currency) => currency.categories.flatMap((category) => category.packs));
check(all.find((item) => item.name === "LV.10").costProfileId === "sheet-googlengn", "a Google NGN pack is on the NGN profile");
check(all.find((item) => item.name === "Crates").costProfileId === "sheet-itunesusd", "\"ITUNES (USD)\" finds the ITUNES(USD) rate");
check(all.find((item) => item.name === "Odd").costProfileId === "" && result.unmatched.map((item) => item.name).join() === "Odd", "a wallet with no rate is left alone and listed");
check(result.packs.costProfiles.find((profile) => profile.id === "keep") && result.packs.costProfiles.find((profile) => profile.id === "sheet-itunesde").baseValue === "26.13", "other profiles stay; the same wallet's is replaced");
check(result.packs.computedColumns[0].gameFormula === GAMEINFO_SHEET_COST_FORMULA, "the game's ต้นทุน becomes amount × its wallet's rate");
check(Math.abs(Number(result.assigned.find((item) => item.name === "Weekly Home").amount) * 26.13 - 38.93) < 0.01, "1.49 EUR at 26.13 is the sheet's 38.93");
check(packs.currencies[0].categories[0].packs[0].costProfileId === "", "the input is not changed in place");

console.log(`gameinfo-channel-costs: ${passed} passed`);
