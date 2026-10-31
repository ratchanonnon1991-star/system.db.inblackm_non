import assert from "node:assert/strict";
import { applyGameinfoChannelCosts, gameinfoChannelKey, gameinfoCostRatePacks, gameinfoCostRateRows, gameinfoRateVariables, parseGameinfoChannelRate } from "../src/lib/gameinfo-channel-costs.js";
import { resolveGameinfoField } from "../src/lib/gameinfo-formula-fields.js";
import { GAMEINFO_SHEET_COST_FORMULA } from "../src/lib/gameinfo-sheet-packs.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

check(gameinfoChannelKey("ITUNES (USD)") === gameinfoChannelKey("ITUNES(USD)"), "spacing and brackets do not split a wallet");
const ngn = parseGameinfoChannelRate("GOOGLE NGN=0.024037:NGN");
check(ngn.channel === "GOOGLE NGN" && ngn.rate === "0.024037" && ngn.currency === "NGN", "a rate reads as wallet, THB rate and currency");
const linked = parseGameinfoChannelRate("GOOGLE NGN=[Rate_NGN]:NGN");
check(linked.rate === "" && linked.rateFormula === "[Rate_NGN]" && ngn.rateFormula === "", "[ชื่อ] follows a variable; a number does not");
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

const variables = [{ id: "v1", name: "Rate_NGN", value: "0.024037", formula: "" }];
const followed = applyGameinfoChannelCosts(packs, [linked], "2026-10-29T00:00:00.000Z", variables);
const profile = followed.packs.costProfiles.find((item) => item.id === "sheet-googlengn");
check(profile.rateFormula === "[Rate_NGN]" && profile.baseValue === "" && followed.assigned[0].rate === 0.024037, "the profile keeps the reference and reports the variable's rate");
const cost = (rate) => resolveGameinfoField({ amountChargedFee: "1070", costProfileId: profile.id }, {}, "อัตราต้นทุน", { costProfiles: followed.packs.costProfiles, formulaVariables: [{ ...variables[0], value: rate }] });
check(cost("0.024037") === 0.024037 && cost("0.03") === 0.03, "editing the variable changes the rate packs are costed at");

const shown = gameinfoCostRateRows(followed.packs.currencies, followed.packs.costProfiles, { formulaVariables: [{ ...variables[0], updatedAt: "2026-10-31T00:00:00.000Z" }] });
check(shown.length === 1 && shown[0].channel === "GOOGLE NGN" && shown[0].rate === 0.024037 && shown[0].source === "Rate_NGN" && shown[0].currency === "NGN", "a wallet's row states its rate and the variable behind it");
check(shown[0].updatedAt === "2026-10-31T00:00:00.000Z", "a row dates from the variable's last edit, not the profile's");
const fixed = gameinfoCostRateRows(result.packs.currencies, result.packs.costProfiles);
check(fixed.length === 3 && fixed.find((row) => row.channel === "ITUNES(DE)").rate === 26.13 && fixed[0].source === "เรทคงที่", "a fixed rate is shown as fixed, one row per wallet");
check(gameinfoCostRateRows(packs.currencies, packs.costProfiles).length === 0, "packs with no profile show nothing");
const inverse = parseGameinfoChannelRate("WAVEPAY=1/[Rate_MMK]:MMK");
check(inverse.rateFormula === "1/[Rate_MMK]" && gameinfoRateVariables(inverse.rateFormula).join() === "Rate_MMK", "a rate kept as units per baht reads through its variable");
const mmkVariables = [{ id: "v2", name: "Rate_MMK", value: "141.69", formula: "", updatedAt: "2026-10-31T00:00:00.000Z" }];
const mmk = applyGameinfoChannelCosts({ currencies: [{ categories: [{ packs: [pack("60 Crystals", "Wavepay", "2000")] }] }], computedColumns: [], costProfiles: [] }, [inverse], "2026-10-29T00:00:00.000Z", mmkVariables);
check(Math.abs(mmk.assigned[0].rate * 2000 - 14.11) < 0.01, "2000 MMK at 141.69 is the sheet's 14.11");
const mmkRow = gameinfoCostRateRows(mmk.packs.currencies, mmk.packs.costProfiles, { formulaVariables: mmkVariables })[0];
check(mmkRow.source === "1/141.69" && mmkRow.updatedAt === "2026-10-31T00:00:00.000Z", "the row shows the sheet's 141.69 and the variable's date");
const other = gameinfoCostRatePacks(followed.packs);
check(other.currencies[0].categories[0].packs.length === 1 && !("name" in other.currencies[0].categories[0].packs[0]), "the other mode sends only what a rate row reads");
const bothModes = gameinfoCostRateRows(packs.currencies, packs.costProfiles, { formulaVariables: variables, other });
check(bothModes.length === 1 && bothModes[0].channel === "GOOGLE NGN" && bothModes[0].rate === 0.024037, "a mode with no profiles still shows the game's other mode's rates");
check(gameinfoCostRateRows(followed.packs.currencies, followed.packs.costProfiles, { formulaVariables: variables, other })[0].packs === 2, "one wallet in both modes is one row");

console.log(`gameinfo-channel-costs: ${passed} passed`);
