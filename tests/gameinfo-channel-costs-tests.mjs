import assert from "node:assert/strict";
import { applyGameinfoChannelCosts, gameinfoChannelKey, gameinfoChargeUnit, gameinfoCostRatePacks, gameinfoCostRateRows, gameinfoRateVariables, parseGameinfoChannelRate } from "../src/lib/gameinfo-channel-costs.js";
import { resolveGameinfoField } from "../src/lib/gameinfo-formula-fields.js";
import { gameinfoSheetCalcRate, sanitizeGameinfoCostProfiles, sanitizeGameinfoSheetCalc } from "../src/lib/gameinfo-cost-profiles.js";
import { gameinfoListingChanges, gameinfoListingPack, gameinfoListingSnapshot } from "../src/lib/gameinfo-pack-listings.js";
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
check(shown.filter((row) => row.packs > 0).length === 1 && shown[0].channel === "GOOGLE NGN" && shown[0].rate === 0.024037 && shown[0].source === "Rate_NGN" && shown[0].currency === "NGN", "a wallet's row states its rate and the variable behind it");
const unused = gameinfoCostRateRows([], [{ id: "sheet-test", label: "test → THB", baseValue: "2", rateFormula: "", inputCurrency: "SGD" }]);
check(unused.length === 1 && unused[0].packs === 0 && unused[0].rate === 2 && unused[0].channel === "test" && unused[0].own, "a rate no pack uses yet still shows, editable");
check(shown[0].updatedAt === "2026-10-31T00:00:00.000Z", "a row dates from the variable's last edit, not the profile's");
const fixed = gameinfoCostRateRows(result.packs.currencies, result.packs.costProfiles);
check(fixed.filter((row) => row.packs > 0).length === 3 && fixed.find((row) => row.channel === "ITUNES(DE)").rate === 26.13 && fixed[0].source === "เรทคงที่", "a fixed rate is shown as fixed, one row per wallet");
check(fixed.some((row) => row.id === "keep" && row.packs === 0), "the game's unused profile shows with no packs");
check(gameinfoCostRateRows(packs.currencies, packs.costProfiles).every((row) => row.packs === 0), "packs with no profile count on no rate");
const owned = { ...packs, computedColumns: [{ key: "cost", label: "ต้นทุน", formula: "[ยอดที่กด + fee]/134.02", gameFormula: "[ยอดที่กด + fee]/134.02" }] };
check(applyGameinfoChannelCosts(owned, rates).packs.computedColumns[0].gameFormula === GAMEINFO_SHEET_COST_FORMULA, "a game with its own ต้นทุน formula still ends up costed at its rates");
check(gameinfoChargeUnit(followed.packs.currencies[0], followed.packs.costProfiles) === "NGN" && gameinfoChargeUnit(result.packs.currencies[1], result.packs.costProfiles) === "", "a tab names its charge currency only when there is one");
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
check(bothModes.filter((row) => row.packs > 0).length === 1 && bothModes[0].channel === "GOOGLE NGN" && bothModes[0].rate === 0.024037, "a mode with no profiles still shows the game's other mode's rates");
check(gameinfoCostRateRows(followed.packs.currencies, followed.packs.costProfiles, { formulaVariables: variables, other })[0].packs === 2, "one wallet in both modes is one row");

// A rate worked out like the sheet, and today's suggestion from it.
const live = { "USDT/THB": 33.62, USDCNY: 6.6723 };
check(Math.abs(gameinfoSheetCalcRate({ kind: "perUsdt", amount: "4,615", usdtThb: "32.6" }, live) - 32.6 / 4615) < 1e-12, "MMK: typed USDT/THB ÷ MMK per USDT, as the sheet's 141.69");
check(Math.abs(gameinfoSheetCalcRate({ kind: "perUsdt", amount: "4615", usdtThb: "32.6" }, live, { live: true }) - 33.62 / 4615) < 1e-12, "the suggestion uses today's USDT/THB");
check(Math.abs(gameinfoSheetCalcRate({ kind: "cnyPerUnit", amount: "5.85" }, { "USDT/THB": 32.57, USDCNY: 6.68 }) - 28.52) < 0.01, "iTunes USD: ¥5.85 ÷ 6.68 × 32.57 is the sheet's 28.52");
check(gameinfoSheetCalcRate({ kind: "cnyPerUnit", amount: "5.85" }, { "USDT/THB": 33 }) === null, "no USDCNY yet, no rate");
check(sanitizeGameinfoSheetCalc({ kind: "perUsdt", amount: "0" }) === null && sanitizeGameinfoSheetCalc({ kind: "other", amount: "5" }) === null, "a calculation needs a known kind and an amount");
const kept = sanitizeGameinfoCostProfiles([{ id: "sheet-wavepay", label: "Wavepay", baseValue: "0.007285", sheetCalc: { kind: "perUsdt", amount: "4615" }, note: " ตามตลาด " }])[0];
check(kept.sheetCalc.amount === "4615" && kept.sheetCalc.usdtThb === "" && kept.note === "ตามตลาด", "a profile keeps its calculation and note");
const sheetRow = gameinfoCostRateRows([{ categories: [{ packs: [{ costProfileId: "sheet-wavepay", channelsMain: ["Wavepay"], amountChargedFee: "2000" }] }] }], [{ ...kept, inputCurrency: "MMK" }], { externalValues: live })[0];
check(sheetRow.method === "sheet" && sheetRow.own && sheetRow.rate === 0.007285 && Math.abs(sheetRow.suggestion - 33.62 / 4615) < 1e-12, "a sheet rate row has its method and today's suggestion");
check(sheetRow.source.includes("4,615 MMK/USDT"), "and says how it is worked out");

// A check holds the pack to its cost rate: changing the rate asks for a new one.
const checked = gameinfoListingSnapshot(gameinfoListingPack({ name: "60 Crystals", price: "20" }, 0.007058));
check(gameinfoListingChanges(checked, gameinfoListingPack({ name: "60 Crystals", price: "20" }, 0.007285)).map((change) => change.key).join() === "costRate", "a new cost rate is a change");
check(gameinfoListingChanges(checked, gameinfoListingPack({ name: "60 Crystals", price: "20" }, undefined)).length === 0, "a rate not worked out yet is not");

console.log(`gameinfo-channel-costs: ${passed} passed`);
