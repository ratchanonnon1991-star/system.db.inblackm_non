// The gameinfo field-label map feeding the shared systemdb formula engine —
// confirms every advertised label actually resolves, and that pack fields
// win over game fields when both exist.
import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula.js";
import {
  GAMEINFO_FIELDS,
  GAMEINFO_FIELD_NAMES,
  resolveGameinfoField,
} from "@/lib/gameinfo-formula-fields.js";
import {
  evaluateGameinfoPackCost,
  sanitizeGameinfoCostProfiles,
  validateGameinfoCostProfiles,
} from "@/lib/gameinfo-cost-profiles.js";

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
  "selected cost profile exposes charge times multiplier as cost",
  resolveGameinfoField(packWithCost, game, "ต้นทุน", { costProfiles }),
  45
);
check(
  "cost can be used by a normal computed formula",
  evaluateFormula(
    parseFormula("([ราคา] - [ต้นทุน]) / [ราคา] * 100"),
    (label) => resolveGameinfoField(packWithCost, game, label, { costProfiles })
  ),
  55.00000000000001
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
