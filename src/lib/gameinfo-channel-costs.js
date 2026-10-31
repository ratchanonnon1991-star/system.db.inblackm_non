// A game whose packs are charged through different wallets — Google NGN,
// iTunes DE in euros, iTunes USD — has one cost rate per wallet, the way the
// source sheet works it out. This gives each wallet a cost profile at its rate,
// points every pack at its wallet's profile, and puts the sheet's own ต้นทุน
// formula on the game, so cost = amount × that wallet's rate.
import { evaluateGameinfoPackCost } from "@/lib/gameinfo-cost-profiles";
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
