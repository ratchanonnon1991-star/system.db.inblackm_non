// The gameinfo field-label map feeding the shared systemdb formula engine —
// confirms every advertised label actually resolves, and that pack fields
// win over game fields when both exist.
import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula.js";
import {
  GAMEINFO_FIELDS,
  GAMEINFO_FIELD_NAMES,
  resolveGameinfoField,
} from "@/lib/gameinfo-formula-fields.js";

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
const pack = { name: "86 Diamonds", price: "100", amountCharged: "86", amountChargedFee: "90", country: "" };

check(
  "every advertised field name resolves to a real key",
  GAMEINFO_FIELD_NAMES.every((label) => typeof GAMEINFO_FIELDS[label] === "string"),
  true
);

check("pack field resolves", resolveGameinfoField(pack, game, "ราคา"), "100");
check("pack field falls back to the game", resolveGameinfoField(pack, game, "ชื่อเกม"), "Mobile Legends");
check("an unknown label resolves to undefined", resolveGameinfoField(pack, game, "ไม่มีจริง"), undefined);

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
