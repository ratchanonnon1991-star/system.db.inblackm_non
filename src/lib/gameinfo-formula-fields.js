// Thai field names a gameinfo computed-column formula can reference, mapped
// to the actual keys evaluateFormula's resolver reads — pack fields first,
// falling back to the parent game's fields. Kept small and fixed on purpose:
// this is what makes the gameinfo editor "simpler" than systemdb's, which can
// reference any column of any query.
export const GAMEINFO_FIELDS = {
  "ชื่อแพ็ก": "name",
  "ราคา": "price",
  "ยอดที่กด": "amountCharged",
  "ยอดที่กด + fee": "amountChargedFee",
  "ประเทศ": "country",
  "ชื่อเกม": "gameName",
  "ภูมิภาค": "region",
  "แพลตฟอร์ม": "platform",
  "เซิร์ฟเวอร์": "server",
  "USDT/THB": "usdtThb",
};

export const GAMEINFO_FIELD_NAMES = Object.keys(GAMEINFO_FIELDS);

export function resolveGameinfoField(pack, game, label) {
  const key = GAMEINFO_FIELDS[label];
  if (!key) return undefined;
  if (pack && key in pack) return pack[key];
  return game ? game[key] : undefined;
}
