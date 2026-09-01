// Thai field names a gameinfo computed-column formula can reference, mapped
// to the actual keys evaluateFormula's resolver reads — pack fields first,
// falling back to the parent game's fields. Kept small and fixed on purpose:
// this is what makes the gameinfo editor "simpler" than systemdb's, which can
// reference any column of any query.
import { evaluateGameinfoPackCost, getGameinfoCostProfile } from "@/lib/gameinfo-cost-profiles";
import { evaluateGameinfoFormulaVariable } from "@/lib/gameinfo-formula-variables";

export const GAMEINFO_FIELDS = {
  "ชื่อแพ็ก": "name",
  "ราคา": "price",
  "ยอดที่กด + fee": "amountChargedFee",
  "ประเทศ": "country",
  "ชื่อเกม": "gameName",
  "ภูมิภาค": "region",
  "แพลตฟอร์ม": "platform",
  "เซิร์ฟเวอร์": "server",
  "อัตราต้นทุน": "__costRate",
  "USDT/THB": "__externalRate",
  USDCNY: "__externalRate",
  IDRTHB: "__externalRate",
  USDIDR: "__externalRate",
};

export const GAMEINFO_FIELD_NAMES = Object.keys(GAMEINFO_FIELDS);

// Formula-variable definitions are numeric inputs, so their picker should not
// suggest descriptive text fields. Keep every field resolvable for existing
// saved formulas; this narrower list only controls what the picker advertises.
export const GAMEINFO_NUMERIC_FIELD_NAMES = [
  "ราคา",
  "ยอดที่กด + fee",
  "USDT/THB",
  "USDCNY",
  "IDRTHB",
  "USDIDR",
];

export function resolveGameinfoField(pack, game, label, context = {}) {
  // Existing saved formulas may still contain the removed label. Resolve it
  // to the only remaining charge field without advertising it in the picker.
  if (label === "ยอดที่กด") return pack?.amountChargedFee;
  if ((context.formulaVariables || []).some((variable) => variable.name === label)) {
    return evaluateGameinfoFormulaVariable(context.formulaVariables, label, (nestedLabel) =>
      resolveGameinfoField(pack, game, nestedLabel, { ...context, formulaVariables: [] })
    );
  }
  const key = GAMEINFO_FIELDS[label];
  if (!key) return undefined;
  if (key === "__externalRate") return context.externalValues?.[label];
  if (key === "__costRate") {
    const profile = getGameinfoCostProfile(context.costProfiles, pack?.costProfileId);
    const result = evaluateGameinfoPackCost(pack, profile, (nestedLabel) => {
      if (nestedLabel === "อัตราต้นทุน") return undefined;
      if (context.externalValues && nestedLabel in context.externalValues) {
        return context.externalValues[nestedLabel];
      }
      return resolveGameinfoField(pack, game, nestedLabel, { ...context, costProfiles: [] });
    });
    return result.rate;
  }
  if (pack && key in pack) return pack[key];
  return game ? game[key] : undefined;
}
