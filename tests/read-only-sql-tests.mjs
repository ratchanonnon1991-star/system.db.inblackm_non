// validateReadOnlySql: the one gate every saved query and every preview goes
// through, so what it refuses is refused everywhere -- the editor, the API,
// and anything that ever calls either.
import { validateReadOnlySql } from "@/server/gamedb-query-runner.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};
const accepts = (name, sql) => {
  try {
    validateReadOnlySql(sql);
    pass += 1;
  } catch (err) {
    failures.push(`${name}\n    unexpectedly refused: ${err.message}`);
  }
};
const refuses = (name, sql, fragment) => {
  try {
    validateReadOnlySql(sql);
    failures.push(`${name}\n    expected a rejection, got none`);
  } catch (err) {
    if (fragment && !err.message.includes(fragment)) {
      failures.push(`${name}\n    message "${err.message}"`);
    } else pass += 1;
  }
};

// --- what it has always refused ------------------------------------------
accepts("a plain SELECT", "SELECT id FROM games");
accepts("a WITH", "WITH x AS (SELECT 1) SELECT * FROM x");
refuses("nothing at all", "   ", "กรุณาใส่");
refuses("an UPDATE", "UPDATE games SET name = 'x'", "SELECT / WITH");
refuses("two statements", "SELECT 1; SELECT 2", "1 statement");
refuses("a write hidden mid-query", "SELECT * FROM games WHERE id IN (DELETE FROM x RETURNING id)", "ไม่อนุญาต");
check(
  "a trailing semicolon is trimmed rather than refused",
  validateReadOnlySql("SELECT id FROM games;"),
  "SELECT id FROM games"
);
accepts("a keyword inside a literal is data", "SELECT id FROM games WHERE note = 'please update'");

// --- CROSS JOIN ----------------------------------------------------------
// Not a safety rule: a decision that it does not belong in this app. Every
// row against every row is a mistake far more often than a plan.
refuses("a CROSS JOIN", "SELECT a.id FROM orders a CROSS JOIN games g", "CROSS JOIN");
refuses(
  "however it is spelled",
  "SELECT a.id FROM orders a cross   join games g",
  "CROSS JOIN"
);
refuses(
  "and wherever it appears",
  "SELECT a.id FROM orders a JOIN games g ON g.id = a.game_id CROSS JOIN users u",
  "CROSS JOIN"
);
accepts(
  "a column named cross_join_note is not one",
  "SELECT a.cross_join_note FROM orders a"
);
accepts("nor is the phrase inside a string", "SELECT a.id FROM orders a WHERE a.note = 'cross join'");
accepts("nor is a quoted identifier", 'SELECT a."cross join" FROM orders a');
accepts("an ordinary join is untouched", "SELECT a.id FROM orders a JOIN games g ON g.id = a.game_id");
accepts("and so is a LEFT JOIN", "SELECT a.id FROM orders a LEFT JOIN games g ON g.id = a.game_id");

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
