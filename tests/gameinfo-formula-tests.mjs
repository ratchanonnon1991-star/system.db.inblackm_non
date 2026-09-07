// The gameinfo field-label map feeding the shared systemdb formula engine —
// confirms every advertised label actually resolves, and that pack fields
// win over game fields when both exist.
import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula.js";
import { readFileSync } from "node:fs";
import {
  GAMEINFO_FIELDS,
  GAMEINFO_FIELD_NAMES,
  GAMEINFO_NUMERIC_FIELD_NAMES,
  resolveGameinfoField,
} from "@/lib/gameinfo-formula-fields.js";
import {
  evaluateGameinfoPackCost,
  sanitizeGameinfoCostProfiles,
  validateGameinfoCostProfiles,
} from "@/lib/gameinfo-cost-profiles.js";
import {
  evaluateGameinfoComputedColumn,
  validateGameinfoComputedDependencies,
} from "@/lib/gameinfo-computed-evaluator.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
function ok(name, value) {
  check(name, Boolean(value), true);
}

const computedEditorSource = readFileSync(new URL("../src/components/gameinfo-computed-editor.js", import.meta.url), "utf8");
const variableEditorSource = readFileSync(new URL("../src/components/gameinfo-formula-variables.js", import.meta.url), "utf8");
const roundingHelpSource = readFileSync(new URL("../src/lib/gameinfo-formula-help.js", import.meta.url), "utf8");
const formulaHelpPanelSource = readFileSync(new URL("../src/components/gameinfo-formula-help-panel.js", import.meta.url), "utf8");
const formulaMemorySource = readFileSync(new URL("../src/components/gameinfo-formula-memory.js", import.meta.url), "utf8");
const bulkFormulaSource = readFileSync(new URL("../src/components/gameinfo-bulk-formula-toolbar.js", import.meta.url), "utf8");
ok("computed formula editor includes shared formula help", computedEditorSource.includes("GameinfoFormulaHelpPanel"));
ok("mixed-variable editor includes shared formula help", variableEditorSource.includes("GameinfoFormulaHelpPanel"));
ok("shared formula help starts as collapsible sections", (formulaHelpPanelSource.match(/<details/g) || []).length === 2);
ok("rounding help documents decimal and step families", roundingHelpSource.includes("ROUNDDOWN") && roundingHelpSource.includes("CEILING") && roundingHelpSource.includes("MROUND"));
check("numeric picker excludes descriptive fields", GAMEINFO_NUMERIC_FIELD_NAMES, [
  "ราคา",
  "ยอดที่กด + fee",
  "USDT/THB",
  "USDCNY",
  "IDRTHB",
  "USDIDR",
  "THBUSD",
]);
ok("variable editor uses the numeric field picker", variableEditorSource.includes("GAMEINFO_NUMERIC_FIELD_NAMES"));
ok("formula memory is a separate side panel", computedEditorSource.includes("lg:grid-cols-[minmax(0,1fr)_20rem]"));
ok("computed editor uses the dynamic mobile viewport", computedEditorSource.includes("max-h-[85dvh]"));
ok(
  "stacked computed editor content scrolls as one pane on narrow screens",
  computedEditorSource.includes("overflow-y-auto overscroll-contain") &&
    computedEditorSource.includes("lg:overflow-hidden")
);
ok(
  "computed editor keeps its header and action footer visible",
  (computedEditorSource.match(/flex shrink-0/g) || []).length >= 2
);
ok("formula memory shows ready-to-use cards with formulas", formulaMemorySource.includes("<Card") && formulaMemorySource.includes("{preset.formula}"));
ok("formula memory management is optional and collapsed", formulaMemorySource.includes("<details") && formulaMemorySource.includes("จัดการคลังสูตร"));
ok("bulk formula editor labels the empty computed-column state", bulkFormulaSource.includes("ไม่มีคอลัมน์สูตร"));

const game = { gameName: "Mobile Legends", region: "Global", platform: "Android/iOS", server: "Asia" };
const pack = { name: "86 Diamonds", price: "100", amountChargedFee: "90", country: "" };

check(
  "every advertised field name resolves to a real key",
  GAMEINFO_FIELD_NAMES.every((label) => typeof GAMEINFO_FIELDS[label] === "string"),
  true
);

check("pack field resolves", resolveGameinfoField(pack, game, "ราคา"), "100");
check("the removed amount label is hidden from the formula picker", GAMEINFO_FIELD_NAMES.includes("ยอดที่กด"), false);
check(
  "an existing saved formula using the removed label falls back to amountChargedFee",
  resolveGameinfoField(pack, game, "ยอดที่กด"),
  "90"
);
check("pack field falls back to the game", resolveGameinfoField(pack, game, "ชื่อเกม"), "Mobile Legends");
check("an unknown label resolves to undefined", resolveGameinfoField(pack, game, "ไม่มีจริง"), undefined);
check(
  "external exchange rate resolves from formula context",
  resolveGameinfoField(pack, game, "USDT/THB", { externalValues: { "USDT/THB": 33.75 } }),
  33.75
);
check("IDRTHB resolves from formula context", resolveGameinfoField(pack, game, "IDRTHB", { externalValues: { IDRTHB: 0.0019 } }), 0.0019);
check("USDIDR resolves from formula context", resolveGameinfoField(pack, game, "USDIDR", { externalValues: { USDIDR: 16350 } }), 16350);
check("THBUSD resolves from formula context", resolveGameinfoField(pack, game, "THBUSD", { externalValues: { THBUSD: 0.0308 } }), 0.0308);
check(
  "THB converts to USD by multiplying the THBUSD rate",
  evaluateFormula(parseFormula("[ราคา] * [THBUSD]"), (label) =>
    resolveGameinfoField(pack, game, label, { externalValues: { THBUSD: 0.0308 } })
  ),
  3.08
);

const costProfiles = [
  { id: "cost_usd", label: "USD", inputCurrency: "USD", baseValue: "0.5", rateFormula: "" },
];
const packWithCost = { ...pack, costProfileId: "cost_usd" };
check(
  "selected cost profile exposes its multiplier",
  resolveGameinfoField(packWithCost, game, "อัตราต้นทุน", { costProfiles }),
  0.5
);
check(
  "cost profile formula can reference its stable baseValue token",
  evaluateGameinfoPackCost(pack, { ...costProfiles[0], rateFormula: "[baseValue] * 2" }).cost,
  90
);
check(
  "cost profile sanitizer removes duplicate ids and normalizes currency",
  sanitizeGameinfoCostProfiles([
    { id: "cost_usd", label: " USD ", inputCurrency: "usd", baseValue: "0.5" },
    { id: "cost_usd", label: "duplicate", baseValue: "2" },
  ]).map(({ id, label, inputCurrency }) => ({ id, label, inputCurrency })),
  [{ id: "cost_usd", label: "USD", inputCurrency: "USD" }]
);
check(
  "invalid cost formula is rejected by validation",
  validateGameinfoCostProfiles([{ ...costProfiles[0], rateFormula: "([baseValue]" }]).length,
  1
);

const dependentColumns = [
  { key: "cost", label: "ต้นทุนคำนวณ", formula: "[ยอดที่กด + fee] * 0.5" },
  { key: "profit", label: "กำไร", formula: "[ราคา] - [ต้นทุนคำนวณ]" },
];
check(
  "computed formula can reference another computed column",
  evaluateGameinfoComputedColumn(dependentColumns[1], dependentColumns, pack, game),
  55
);
const roundedColumns = [
  { key: "rounded-down", label: "ปัดลง", formula: "0.123", type: "number" },
  { key: "rounded-up", label: "ปัดขึ้น", formula: "0.126", type: "number" },
  { key: "continued", label: "คำนวณต่อ", formula: "[ปัดขึ้น] * 100", type: "number" },
];
check("gameinfo numeric formulas round 0.123 to two decimals", evaluateGameinfoComputedColumn(roundedColumns[0], roundedColumns, pack, game), 0.12);
check("gameinfo numeric formulas round 0.126 to two decimals", evaluateGameinfoComputedColumn(roundedColumns[1], roundedColumns, pack, game), 0.13);
check("dependent formulas start from the rounded value", evaluateGameinfoComputedColumn(roundedColumns[2], roundedColumns, pack, game), 13);
const manualColumns = [{
  key: "manual-cost",
  label: "ต้นทุนกรอกเอง",
  formula: "",
  entryMode: "manual",
  rowOverrides: { pk_number: "125", pk_formula: "[ราคา] * 0.9" },
}];
check(
  "manual column starts empty when a pack has no value",
  evaluateGameinfoComputedColumn(manualColumns[0], manualColumns, { ...pack, id: "pk_empty" }, game),
  undefined
);
check(
  "manual column accepts a number",
  evaluateGameinfoComputedColumn(manualColumns[0], manualColumns, { ...pack, id: "pk_number" }, game),
  125
);
check(
  "manual column accepts a formula",
  evaluateGameinfoComputedColumn(manualColumns[0], manualColumns, { ...pack, id: "pk_formula" }, game),
  90
);
check("blank manual columns pass dependency validation", validateGameinfoComputedDependencies(manualColumns), []);
const scopedColumns = [
  {
    key: "cost",
    label: "ต้นทุนคำนวณ",
    formula: "[ราคา] * 0.5",
    scopeMode: "category",
    categoryFormulas: { cat_special: "[ราคา] * 0.25" },
  },
  {
    key: "profit",
    label: "กำไร",
    formula: "[ราคา] - [ต้นทุนคำนวณ]",
    scopeMode: "category",
    categoryFormulas: {},
    rowOverrides: { pk_special: "[ราคา] * 0.9" },
  },
];
check(
  "category formula is used by dependent computed columns",
  evaluateGameinfoComputedColumn(scopedColumns[1], scopedColumns, pack, game, {
    categoryId: "cat_special",
  }),
  75
);
check(
  "missing category formula falls back to the global formula",
  evaluateGameinfoComputedColumn(scopedColumns[1], scopedColumns, pack, game, {
    categoryId: "cat_normal",
  }),
  50
);
check(
  "pack formula wins over category and global formulas",
  evaluateGameinfoComputedColumn(
    scopedColumns[1],
    scopedColumns,
    { ...pack, id: "pk_special" },
    game,
    { categoryId: "cat_special" }
  ),
  90
);
check("valid computed dependency graph has no errors", validateGameinfoComputedDependencies(dependentColumns), []);
check(
  "computed dependency cycle is rejected",
  validateGameinfoComputedDependencies([
    { key: "a", label: "A", formula: "[B] + 1" },
    { key: "b", label: "B", formula: "[A] + 1" },
  ]).some((message) => message.includes("วนซ้ำ")),
  true
);
check(
  "duplicate computed labels are rejected",
  validateGameinfoComputedDependencies([
    { key: "a", label: "ซ้ำ", formula: "1" },
    { key: "b", label: "ซ้ำ", formula: "2" },
  ]).some((message) => message.includes("ชื่อคอลัมน์สูตรซ้ำ")),
  true
);
check(
  "computed column names cannot duplicate a formula variable",
  validateGameinfoComputedDependencies(
    [{ key: "a", label: "ต้นทุน", formula: "1" }],
    ["ต้นทุน"]
  ).some((message) => message.includes('มีชื่อ "ต้นทุน" อยู่แล้ว')),
  true
);
check(
  "computed column names cannot duplicate a GameInfo field",
  validateGameinfoComputedDependencies([{ key: "a", label: "ราคา", formula: "1" }])
    .some((message) => message.includes('มีชื่อ "ราคา" อยู่แล้ว')),
  true
);
check(
  "duplicate column names are case insensitive",
  validateGameinfoComputedDependencies([
    { key: "a", label: "Profit", formula: "1" },
    { key: "b", label: " profit ", formula: "2" },
  ]).some((message) => message.includes("ชื่อคอลัมน์สูตรซ้ำ")),
  true
);
check(
  "invalid stored category formulas are rejected even while global mode is active",
  validateGameinfoComputedDependencies([
    {
      key: "a",
      label: "A",
      formula: "1",
      scopeMode: "global",
      categoryFormulas: { cat_hidden: "[ไม่มีจริง] + 1" },
    },
  ]).some((message) => message.includes("สูตรหมวด cat_hidden")),
  true
);
check(
  "category-specific dependency cycles are rejected",
  validateGameinfoComputedDependencies([
    {
      key: "a",
      label: "A",
      formula: "1",
      scopeMode: "category",
      categoryFormulas: { cat_special: "[B]" },
    },
    {
      key: "b",
      label: "B",
      formula: "2",
      scopeMode: "category",
      categoryFormulas: { cat_special: "[A]" },
    },
  ]).some((message) => message.includes("วนซ้ำ")),
  true
);

// A game-level field of the same key as a pack field: the pack's own value
// wins, since a formula about "this row" should mean this row's fields first.
const packWithGameName = { ...pack, gameName: "override" };
check(
  "a pack-level value of the same key beats the game's",
  resolveGameinfoField(packWithGameName, game, "ชื่อเกม"),
  "override"
);

// --- end-to-end through the shared formula engine -------------------------
const resolveRef = (label) => resolveGameinfoField(pack, game, label);
check(
  "a markup formula referencing ราคา evaluates through the shared engine",
  evaluateFormula(parseFormula("[ราคา] * 1.1"), resolveRef),
  110.00000000000001
);
check(
  "IF over a gameinfo field",
  evaluateFormula(parseFormula('IF([ราคา] > 50, "แพง", "ถูก")'), resolveRef),
  "แพง"
);
ok(
  "every field name is safe to use as a [ref] token (no stray brackets)",
  GAMEINFO_FIELD_NAMES.every((label) => !label.includes("[") && !label.includes("]"))
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
