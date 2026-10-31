// A game whose packs are charged through different wallets — Google NGN,
// iTunes DE in euros, iTunes USD — has one cost rate per wallet, the way the
// source sheet works it out. This gives each wallet a cost profile at its rate,
// points every pack at its wallet's profile, and puts the sheet's own ต้นทุน
// formula on the game, so cost = amount × that wallet's rate.
import { evaluateGameinfoPackCost, getGameinfoCostProfile } from "@/lib/gameinfo-cost-profiles";
import { resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { evaluateGameinfoFormulaVariable } from "@/lib/gameinfo-formula-variables";
import { gameinfoSheetCostFormulaColumns } from "@/lib/gameinfo-sheet-packs";

// "ITUNES (USD)" and "ITUNES(USD)" are one wallet.
export function gameinfoChannelKey(channel) {
  return String(channel ?? "").replace(/[\s()]+/g, "").toLocaleLowerCase("en");
}

/**
 * "GOOGLE NGN=0.024037:NGN" → { channel, rate, currency }. The currency is
 * what the amount is in (shown on the profile); the rate is THB per unit.
 * "GOOGLE NGN=[Rate_NGN]:NGN" follows a ตัวแปรผสม instead, so one edit to the
 * variable moves the cost of every pack on that wallet.
 */
export function parseGameinfoChannelRate(text) {
  const match = /^(.+?)=(\[[^[\]]+\]|[\d.]+)(?::([A-Za-z]{2,12}))?$/.exec(String(text ?? "").trim());
  const variable = match?.[2].startsWith("[") ? match[2] : "";
  if (!match || !(variable || Number(match[2]) > 0)) throw new Error(`อ่านเรทไม่ออก: "${text}" (รูปแบบ: ช่องทาง=เรท:สกุลเงิน)`);
  return { channel: match[1].trim(), rate: variable ? "" : match[2], rateFormula: variable, currency: (match[3] || "").toUpperCase() };
}

/**
 * The game's packs with a profile per given wallet and each pack on its
 * wallet's profile. Packs on a wallet with no rate keep what they had and are
 * listed in `unmatched`. Profiles the game already has stay; one for the same
 * wallet is replaced. `formulaVariables` only give `assigned` its rates.
 */
export function applyGameinfoChannelCosts(packs, rates, updatedAt = new Date().toISOString(), formulaVariables = []) {
  const profiles = rates.map(({ channel, rate, rateFormula = "", currency }) => ({
    id: `sheet-${gameinfoChannelKey(channel).replace(/[^a-z0-9]+/g, "-")}`,
    label: `${channel} → THB (จากชีต)`,
    inputCurrency: currency.slice(0, 12),
    baseValue: String(rate),
    rateFormula,
    updatedAt,
    updatedBy: null,
  }));
  const profileByChannel = new Map(rates.map((item, index) => [gameinfoChannelKey(item.channel), profiles[index]]));
  const assigned = [];
  const unmatched = [];
  const currencies = (packs.currencies || []).map((currency) => ({
    ...currency,
    categories: (currency.categories || []).map((category) => ({
      ...category,
      packs: (category.packs || []).map((pack) => {
        const channel = pack.channelsMain?.[0] || "";
        const profile = profileByChannel.get(gameinfoChannelKey(channel));
        if (!profile) {
          unmatched.push({ name: pack.name, channel });
          return pack;
        }
        const { rate } = evaluateGameinfoPackCost(pack, profile, (label) => evaluateGameinfoFormulaVariable(formulaVariables, label));
        assigned.push({ name: pack.name, channel, amount: pack.amountChargedFee, rate });
        return { ...pack, costProfileId: profile.id };
      }),
    })),
  }));
  const ids = new Set(profiles.map((profile) => profile.id));
  const costProfiles = [...(packs.costProfiles || []).filter((profile) => !ids.has(profile.id)), ...profiles];
  return {
    packs: {
      ...packs,
      currencies,
      costProfiles,
      computedColumns: gameinfoSheetCostFormulaColumns(packs.computedColumns, costProfiles) || packs.computedColumns,
    },
    assigned,
    unmatched,
  };
}

/** Only what the rate rows read from a mode's packs, to keep the page light. */
export function gameinfoCostRatePacks({ currencies, costProfiles } = {}) {
  const packs = (currencies || [])
    .flatMap((currency) => (currency.categories || []).flatMap((category) => category.packs || []))
    .filter((pack) => pack.costProfileId)
    .map(({ channelsMain, costProfileId, amountChargedFee }) => ({ channelsMain, costProfileId, amountChargedFee }));
  return { currencies: [{ categories: [{ packs }] }], costProfiles: costProfiles || [] };
}

/**
 * One row per cost profile the game's packs are on: the wallet, the rate it
 * works out to now, where that rate comes from and when it last changed.
 * `other` is the game's other mode: a game's rates are the game's, as on its
 * sheet tab, so both modes' wallets show whichever mode is open.
 */
export function gameinfoCostRateRows(currencies, costProfiles, { formulaVariables = [], externalValues = {}, other = null } = {}) {
  const rows = new Map();
  for (const source of [{ currencies, costProfiles }, other]) {
    const context = { costProfiles: source?.costProfiles, formulaVariables, externalValues };
    for (const currency of source?.currencies || []) {
      for (const category of currency.categories || []) {
        for (const pack of category.packs || []) {
          const profile = getGameinfoCostProfile(source.costProfiles, pack.costProfileId);
          if (!profile) continue;
          const row = rows.get(profile.id);
          if (row) {
            row.packs += 1;
            continue;
          }
          const formula = String(profile.rateFormula || "").trim();
          const variable = (formulaVariables || []).find((item) => `[${item.name}]` === formula);
          rows.set(profile.id, {
            id: profile.id,
            channel: pack.channelsMain?.[0] || profile.label,
            currency: profile.inputCurrency || "",
            rate: resolveGameinfoField(pack, {}, "อัตราต้นทุน", context),
            source: variable ? (variable.formula || variable.name) : (formula || "เรทคงที่"),
            updatedAt: variable?.updatedAt || profile.updatedAt || "",
            packs: 1,
          });
        }
      }
    }
  }
  return [...rows.values()];
}
