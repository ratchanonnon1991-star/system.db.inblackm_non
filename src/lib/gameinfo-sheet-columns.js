// Pack columns the source sheet has and GameInfo did not: what Kaleoz leaves
// after its 5% and the profit on that, and G2G. A column exists for every game
// but its formula belongs to the game that added it, as with เพิ่มสูตร: other
// games get an empty column, and empty columns stay out of their tables.
export const GAMEINFO_SHEET_EXTRA_COLUMNS = [
  { key: "col_sheet_kaleoz_net", label: "KALEOZ 5%", formula: "[ราคาขาย(KALEOZ)]*0.95", symbol: "฿" },
  { key: "col_sheet_kaleoz_profit", label: "กำไร (KALEOZ 5%)", formula: "[KALEOZ 5%]-[ต้นทุน]", symbol: "฿" },
  { key: "col_sheet_kaleoz_margin", label: "%กำไร (KALEOZ 5%)", formula: "[กำไร (KALEOZ 5%)]/[KALEOZ 5%]*100", symbol: "%" },
  { key: "col_sheet_g2g", label: "G2G", formula: "[ราคา]", symbol: "฿" },
  { key: "col_sheet_g2g_usd", label: "G2G USD", formula: "[G2G]*[THBUSD]", symbol: "$" },
];

const sameLabel = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * The columns with whichever of these are missing, by name, so a column
 * someone already added by hand stays theirs. `keys` is all five as they
 * stand, for hiding them from the Topup view.
 */
export function withGameinfoSheetColumns(computedColumns) {
  const columns = [...(computedColumns || [])];
  const added = [];
  const keys = [];
  for (const extra of GAMEINFO_SHEET_EXTRA_COLUMNS) {
    const existing = columns.find((column) => sameLabel(column.label, extra.label));
    keys.push(existing?.key || extra.key);
    if (existing) continue;
    columns.push({
      ...extra,
      formula: "",
      gameFormula: extra.formula,
      entryMode: "formula",
      gameEntryMode: "formula",
      kind: "formula",
      marketKey: "",
      type: "number",
      scopeMode: "global",
      gameScopeMode: "global",
      enabled: true,
      categoryFormulas: {},
      rowOverrides: {},
    });
    added.push(extra.label);
  }
  return { columns, added, keys };
}
