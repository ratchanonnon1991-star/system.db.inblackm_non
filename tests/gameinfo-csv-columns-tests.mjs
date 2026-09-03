import {
  buildGameinfoCsvColumns,
  gameinfoCsvCellToFormula,
  gameinfoCsvExtraHeaders,
} from "@/lib/gameinfo-csv-columns.js";
import { buildPackTree } from "@/lib/gameinfo-import.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

check(
  "known and retired headers are not mistaken for new columns",
  gameinfoCsvExtraHeaders(["game_id", "pack_name", "amount_charged", "กำไร", "ต้นทุน"]),
  ["กำไร", "ต้นทุน"]
);

// --- one cell -> one stored formula --------------------------------------
check("a blank cell stores nothing", gameinfoCsvCellToFormula("  "), "");
check("a number is stored as itself", gameinfoCsvCellToFormula("1500"), "1500");
check("a decimal survives", gameinfoCsvCellToFormula("12.5"), "12.5");
check("a negative number survives", gameinfoCsvCellToFormula("-5"), "-5");
check("Excel thousands separators are dropped", gameinfoCsvCellToFormula("1,000"), "1000");
check("a formula is kept as written", gameinfoCsvCellToFormula("[ราคา] * 1.05"), "[ราคา] * 1.05");
check("text becomes a string literal", gameinfoCsvCellToFormula("ข้อมูล"), '"ข้อมูล"');
check("quotes inside text are escaped", gameinfoCsvCellToFormula('a"b'), '"a""b"');
check("a percentage is text, not a broken formula", gameinfoCsvCellToFormula("12.5%"), '"12.5%"');
check("surrounding spaces are trimmed", gameinfoCsvCellToFormula("  700  "), "700");

// --- headers -> columns ---------------------------------------------------
function columnsFor(rows, existing = []) {
  const headers = Object.keys(rows[0]);
  const tree = buildPackTree(rows);
  return buildGameinfoCsvColumns(headers, tree.rowPacks, existing);
}

const base = { currency_name: "Gem", category_name: "Gem", price: "100", amount_charged_fee: "90" };
const perPack = columnsFor([
  { ...base, pack_name: "A", ต้นทุน: "70" },
  { ...base, pack_name: "B", ต้นทุน: "140" },
]);
check("a new column is proposed for an unknown header", perPack.columns.length, 1);
check("the header becomes the column label", perPack.columns[0].label, "ต้นทุน");
check("a column nobody registered yet is marked new", perPack.columns[0].isNew, true);
check("differing values are stored per pack", Object.values(perPack.columns[0].rowOverrides), ["70", "140"]);
check("a column of plain values has no column formula", perPack.columns[0].formula, "");
check("a column of plain values is filled in by hand", perPack.columns[0].entryMode, "manual");

const shared = columnsFor([
  { ...base, pack_name: "A", กำไร: "[ราคา] * 1.05" },
  { ...base, pack_name: "B", กำไร: "[ราคา] * 1.05" },
]);
check(
  "one formula repeated on every pack becomes this game's formula",
  shared.columns[0].gameFormula,
  "[ราคา] * 1.05"
);
// The column's own formula is what every game computes. A file states what
// the games it names compute, so it must never write that one, or putting a
// formula beside one game's packs would change all 216 games.
check("but never the formula the column shares with every game", shared.columns[0].formula, "");
check("a promoted formula leaves no per-pack copies", shared.columns[0].rowOverrides, {});
check("a promoted column is a formula column", shared.columns[0].entryMode, "formula");

const mixed = columnsFor([
  { ...base, pack_name: "A", กำไร: "[ราคา] * 1.05" },
  { ...base, pack_name: "B", กำไร: "[ราคา] * 2" },
]);
check("formulas that differ stay per pack", mixed.columns[0].gameFormula, "");
check("and still write no shared formula", mixed.columns[0].formula, "");
check("both per-pack formulas are kept", Object.values(mixed.columns[0].rowOverrides).sort(), [
  "[ราคา] * 1.05",
  "[ราคา] * 2",
]);

const repeatedValue = columnsFor([
  { ...base, pack_name: "A", ต้นทุน: "70" },
  { ...base, pack_name: "B", ต้นทุน: "70" },
]);
check(
  "the same plain value on every pack is a coincidence, not a rule",
  repeatedValue.columns[0].gameFormula,
  ""
);

const blank = columnsFor([
  { ...base, pack_name: "A", "คอลัมน์ใหม่": "" },
  { ...base, pack_name: "B", "คอลัมน์ใหม่": "" },
]);
check("a header with no values still creates the column", blank.columns.length, 1);
check("an empty column starts with nothing in it", blank.columns[0].rowOverrides, {});
check("an empty column reports no values", blank.columns[0].valueCount, 0);

const broken = columnsFor([{ ...base, pack_name: "A", กำไร: "[ราคา] * " }]);
check("an unparseable formula is reported", broken.errors.length, 1);
check("the error names the column and the pack", broken.errors[0].includes('"กำไร"') && broken.errors[0].includes('"A"'), true);
check("a bad cell is not written", broken.columns[0].rowOverrides, {});

// --- matching an already-registered column --------------------------------
const reuse = columnsFor(
  [{ ...base, pack_name: "A", "ต้นทุน": "70" }],
  [{ key: "col_existing", label: "ต้นทุน" }]
);
check("a header naming a registered column reuses its key", reuse.columns[0].key, "col_existing");
check("filling in a registered column is not creating one", reuse.columns[0].isNew, false);

// Pack ids are generated inside buildPackTree, so the values have to be keyed
// off what it actually produced, not off row order.
const tree = buildPackTree([
  { ...base, pack_name: "A", ต้นทุน: "70" },
  { ...base, pack_name: "", price: "", amount_charged_fee: "", ต้นทุน: "99" },
  { ...base, pack_name: "C", ต้นทุน: "80" },
]);
check("rows with no pack data produce no pack", tree.rowPacks.length, 2);
const skipped = buildGameinfoCsvColumns(["ต้นทุน"], tree.rowPacks);
check(
  "values line up with the packs that were actually created",
  Object.values(skipped.columns[0].rowOverrides),
  ["70", "80"]
);
check(
  "overrides are keyed by generated pack id",
  Object.keys(skipped.columns[0].rowOverrides),
  tree.rowPacks.map((entry) => entry.packId)
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
