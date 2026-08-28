import {
  evaluateGameinfoFormulaVariable,
  sanitizeGameinfoFormulaVariables,
  validateGameinfoFormulaVariables,
} from "@/lib/gameinfo-formula-variables.js";
import { readFileSync } from "node:fs";
import {
  getGameinfoFormulaVariables,
  saveGameinfoFormulaVariables,
} from "@/server/gameinfo-formula-variables.js";
import { log, reset, setResponder } from "@/lib/db.js";
import { validateGameinfoComputedDependencies } from "@/lib/gameinfo-computed-evaluator.js";

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

const editorSource = readFileSync(new URL("../src/components/gameinfo-formula-variables.js", import.meta.url), "utf8");
ok("variable editor uses one stable card grid while categories are typed", editorSource.includes('{variables.map((variable) => ('));
check("category edits do not remount cards under category-derived section keys", editorSource.includes('groups.map(([category, items])'), false);
ok("variable fields stack only at narrow viewport widths", editorSource.includes('grid min-w-0 flex-1 gap-2 sm:grid-cols-2'));

const variables = sanitizeGameinfoFormulaVariables([
  { id: "base", name: "เรทขาย", category: "ราคา", value: "1.5" },
  { id: "total", name: "ราคาหลังคูณ", category: "ราคา", formula: "[ยอดที่กด + fee] * [เรทขาย]" },
  { id: "usdt", name: "ต้นทุน USDT", category: "", formula: "[ราคาหลังคูณ] / [USDT/THB]" },
]);
check("sanitizer keeps categorized and floating variables", variables.map((item) => item.category), ["ราคา", "ราคา", ""]);
check("valid variables can depend on pack fields, rates, and each other", validateGameinfoFormulaVariables(
  variables,
  ["ยอดที่กด + fee", "USDT/THB"]
), []);
check("nested variables evaluate with external pack and exchange-rate values", evaluateGameinfoFormulaVariable(
  variables,
  "ต้นทุน USDT",
  (name) => ({ "ยอดที่กด + fee": 100, "USDT/THB": 30 }[name])
), 5);

const invalid = sanitizeGameinfoFormulaVariables([
  { id: "a", name: "A", formula: "[B]" },
  { id: "b", name: "B", formula: "[A]" },
  { id: "c", name: "ราคา", value: "1" },
]);
const invalidErrors = validateGameinfoFormulaVariables(invalid, ["ราคา"]);
ok("validation rejects circular variable formulas", invalidErrors.some((message) => message.includes("วนซ้ำ")));
ok("validation rejects names reserved by displayed pack fields", invalidErrors.some((message) => message.includes("สงวน")));
check("computed pack formulas accept saved game variables", validateGameinfoComputedDependencies([
  { key: "net", label: "สุทธิ", formula: "[ราคาหลังคูณ] - 10" },
], variables.map((item) => item.name)), []);

reset();
setResponder((text) => {
  if (/SELECT data FROM gamelist_formula_variables/.test(text)) return { rows: [] };
  return null;
});
const saved = await saveGameinfoFormulaVariables(9, variables, { id: 4, name: "Tester" });
check("saving stamps each changed variable with actor", saved.map((item) => item.updatedBy), ["Tester", "Tester", "Tester"]);
ok("global variable save uses one transaction-wide lock", log.some((entry) => /pg_advisory_xact_lock/.test(entry.text)));
ok("variable config is written as one JSON document", log.some((entry) => /INSERT INTO gamelist_formula_variables/.test(entry.text)));
const auditWrite = log.find((entry) => /INSERT INTO gamelist_formula_variable_logs/.test(entry.text) && entry.params?.length === 5);
check("a separate global audit row records the actor", auditWrite?.params?.slice(0, 3), [0, 4, "Tester"]);
ok("config and audit commit atomically", log.some((entry) => entry.text === "COMMIT"));

reset();
setResponder((text) => {
  if (/SELECT data FROM gamelist_formula_variables/.test(text)) {
    return { rows: [{ data: { variables: saved } }] };
  }
  return null;
});
const unchanged = await saveGameinfoFormulaVariables(9, saved, { id: 8, name: "Another editor" });
check("an unchanged definition keeps its original update actor", unchanged.map((item) => item.updatedBy), ["Tester", "Tester", "Tester"]);
check("an unchanged definition does not create a duplicate audit row", log.some((entry) => /INSERT INTO gamelist_formula_variable_logs/.test(entry.text) && entry.params?.length === 5), false);

reset();
setResponder((text) => {
  if (/SELECT data FROM gamelist_formula_variables WHERE/.test(text)) {
    return { rows: [{ data: { variables: saved } }] };
  }
  if (/FROM gamelist_formula_variable_logs/.test(text)) {
    return { rows: [{ id: 11, actor_id: 4, actor_name: "Tester", before_data: [], after_data: saved, created_at: "2026-08-17T00:00:00.000Z" }] };
  }
  return null;
});
const loaded = await getGameinfoFormulaVariables(9, { includeLogs: true });
check("variable cards retain their saved update dates", loaded.variables.every((item) => Boolean(item.updatedAt)), true);
check("history is loaded from its dedicated log table", loaded.logs[0]?.actorName, "Tester");
check("reads always use the one global scope instead of the requested game", log.find((entry) => /SELECT data FROM gamelist_formula_variables WHERE/.test(entry.text))?.params, [0]);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
