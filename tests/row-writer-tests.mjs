// The INSERT/DELETE writer, against a fake pool that records every statement,
// so what reaches SQL — and what does not — can be asserted directly.
import { insertRow, deleteRow, restoreRow } from "@/server/gamedb-row-writer.js";
import { log, reset } from "@/lib/db.js";
import { setAllowWrite } from "@/server/gamedb-side-tables.js";
import { normalizeInputs, normalizeLayout } from "@/lib/gamedb-layout.js";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};
const ok = (name, value) => check(name, Boolean(value), true);

async function rejects(name, promise, { status, fragment } = {}) {
  try {
    await promise;
    failures.push(`${name}\n    expected a rejection, got none`);
  } catch (err) {
    const problems = [];
    if (status && err.status !== status) problems.push(`status ${err.status} (wanted ${status})`);
    if (fragment && !err.message.includes(fragment)) problems.push(`message "${err.message}"`);
    if (problems.length) failures.push(`${name}\n    ${problems.join(", ")}`);
    else pass += 1;
  }
}

const statements = () => log.filter((entry) => entry.text !== "RELEASE").map((e) => e.text.trim());
const find = (pattern) => log.find((entry) => pattern.test(entry.text));

const EDITABLE = {
  table: "table7",
  pk: "ID_iTune",
  columns: ["Mail", "PASS", "Amount", "Supplier"],
  allowInsert: true,
  allowDelete: true,
  inputs: normalizeInputs([{ column: "Mail", required: true }]),
};

// --- insert --------------------------------------------------------------
setAllowWrite(true);
reset();
const inserted = await insertRow({
  editable: EDITABLE,
  connection: null,
  values: { Mail: "a@b.com", PASS: "Cz367599", Amount: 50 },
});
check("the new row's key comes back", inserted.pkValue, 99);
ok("the insert is wrapped in a transaction", statements()[0] === "BEGIN");
ok("the transaction is committed", statements().at(-1) === "COMMIT");
ok("a statement timeout is set", statements().some((s) => s.includes("statement_timeout")));

const insertStatement = find(/^\s*INSERT/);
ok(
  "identifiers are quoted",
  insertStatement.text.includes('INSERT INTO "table7" ("Mail", "PASS", "Amount")')
);
ok("values are placeholders, not text", insertStatement.text.includes("VALUES ($1, $2, $3)"));
ok("the key is returned by name", insertStatement.text.includes('RETURNING "ID_iTune" AS pk'));
check("values travel as parameters", insertStatement.params, ["a@b.com", "Cz367599", 50]);
ok(
  "no value appears in the SQL text",
  !insertStatement.text.includes("a@b.com") && !insertStatement.text.includes("Cz367599")
);

// a column outside the allow-list is dropped, not written
reset();
await insertRow({
  editable: EDITABLE,
  connection: null,
  values: { Mail: "a@b.com", is_admin: true, "ID_iTune": 1 },
});
const guarded = find(/^\s*INSERT/);
ok("a column that is not writable is dropped", !guarded.text.includes("is_admin"));
ok("the key column is not written unless it is allowed", !guarded.text.includes('"ID_iTune",'));
check("only the allowed value is bound", guarded.params, ["a@b.com"]);

// A blank box must leave the column out of the statement, not send NULL —
// NULL would override a DEFAULT the table relies on.
reset();
await insertRow({
  editable: EDITABLE,
  connection: null,
  values: { Mail: "a@b.com", PASS: "", Amount: null, Supplier: undefined },
});
const sparse = find(/^\s*INSERT/);
check("only the filled column is written", sparse.params, ["a@b.com"]);
ok("a blank column is left out of the column list", !sparse.text.includes('"PASS"'));
ok("a null column is left out too", !sparse.text.includes('"Amount"'));
ok("no NULL is sent that could override a DEFAULT", !sparse.params.includes(null));

reset();
await rejects(
  "a form with every box blank says so",
  insertRow({
    editable: { ...EDITABLE, inputs: [] },
    connection: null,
    values: { PASS: "", Amount: "" },
  }),
  { status: 400, fragment: "ยังไม่ได้กรอก" }
);
check("an all-blank form never reaches SQL", statements(), []);

// A required column that is blank is a better message than "nothing filled",
// so that check has to come first.
reset();
await rejects(
  "a required column is reported before the all-blank message",
  insertRow({ editable: EDITABLE, connection: null, values: { PASS: "", Amount: "" } }),
  { status: 400, fragment: "Mail" }
);

// zero and false are values, not blanks
reset();
await insertRow({ editable: EDITABLE, connection: null, values: { Mail: "a@b.com", Amount: 0 } });
check("zero is written, not treated as blank", find(/^\s*INSERT/).params, ["a@b.com", 0]);

// --- insert refusals -----------------------------------------------------
reset();
await rejects(
  "a row with no writable column is refused",
  insertRow({ editable: EDITABLE, connection: null, values: { nope: 1 } }),
  { status: 400 }
);
check("nothing was sent to the database", statements(), []);

reset();
await rejects(
  "a required column must be filled",
  insertRow({ editable: EDITABLE, connection: null, values: { PASS: "x" } }),
  { status: 400, fragment: "Mail" }
);
check("a missing required column never reaches SQL", statements(), []);

reset();
await rejects(
  "a required column filled with spaces is still empty",
  insertRow({ editable: EDITABLE, connection: null, values: { Mail: "   ", PASS: "x" } }),
  { status: 400, fragment: "Mail" }
);

reset();
await rejects(
  "insert is refused when the query does not allow it",
  insertRow({
    editable: { ...EDITABLE, allowInsert: false },
    connection: null,
    values: { Mail: "a@b.com" },
  }),
  { status: 403 }
);

reset();
await rejects(
  "insert is refused when the query is not editable at all",
  insertRow({ editable: null, connection: null, values: { Mail: "a@b.com" } }),
  { status: 400 }
);

setAllowWrite(false);
reset();
await rejects(
  "insert is refused when the database is read-only",
  insertRow({ editable: EDITABLE, connection: null, values: { Mail: "a@b.com" } }),
  { status: 403, fragment: "ยังไม่ได้เปิดให้เขียน" }
);
check("a read-only database is never connected to", statements(), []);
setAllowWrite(true);

reset({ fail: "duplicate key value violates unique constraint" });
await rejects(
  "a database error is reported, not swallowed",
  insertRow({ editable: EDITABLE, connection: null, values: { Mail: "a@b.com" } }),
  { status: 400, fragment: "duplicate key" }
);
ok("a failed insert is rolled back", statements().includes("ROLLBACK"));
ok("a failed insert is not committed", !statements().includes("COMMIT"));

// an injected table name cannot get through the quoting
reset();
await rejects(
  "a hostile table name is refused",
  insertRow({
    editable: { ...EDITABLE, table: 'x"; DROP TABLE gamedb_users; --' },
    connection: null,
    values: { Mail: "a@b.com" },
  }),
  { status: 400 }
);
check("a hostile table name never reaches SQL", statements(), []);

reset();
await rejects(
  "a hostile column name is refused",
  insertRow({
    editable: { ...EDITABLE, columns: ['x" , (SELECT 1)) --'] },
    connection: null,
    values: { 'x" , (SELECT 1)) --': 1 },
  }),
  { status: 400 }
);

// --- delete --------------------------------------------------------------
reset({ rows: [{ ID_iTune: 4, Mail: "a@b.com" }] });
const removed = await deleteRow({ editable: EDITABLE, connection: null, pkValue: 4 });
ok("the deleted row is summarised for the log", removed.summary.includes("a@b.com"));
ok("the row is locked before deleting", find(/FOR UPDATE/) !== undefined);
ok(
  "the delete is by quoted key and a bound value",
  find(/^\s*DELETE/).text.includes('DELETE FROM "table7" WHERE "ID_iTune" = $1')
);
check("the key travels as a parameter", find(/^\s*DELETE/).params, [4]);
ok("the delete is committed", statements().at(-1) === "COMMIT");

reset({ rows: [] });
await rejects(
  "deleting a row that is gone reports 404",
  deleteRow({ editable: EDITABLE, connection: null, pkValue: 4 }),
  { status: 404 }
);
ok("a missing row is rolled back, not deleted", statements().includes("ROLLBACK"));
ok("no DELETE is issued for a missing row", !statements().some((s) => s.startsWith("DELETE")));

reset({ rows: [{ id: 1 }, { id: 2 }] });
await rejects(
  "a key matching two rows refuses to delete either",
  deleteRow({ editable: EDITABLE, connection: null, pkValue: 4 }),
  { status: 409, fragment: "ไม่ใช่ค่าที่ไม่ซ้ำ" }
);
ok("no DELETE is issued for an ambiguous key", !statements().some((s) => s.startsWith("DELETE")));

reset({ rows: [{ id: 1 }] });
await rejects(
  "delete is refused when the query does not allow it",
  deleteRow({ editable: { ...EDITABLE, allowDelete: false }, connection: null, pkValue: 4 }),
  { status: 403 }
);
check("a refused delete never opens a transaction", statements(), []);

setAllowWrite(false);
reset({ rows: [{ id: 1 }] });
await rejects(
  "delete is refused when the database is read-only",
  deleteRow({ editable: EDITABLE, connection: null, pkValue: 4 }),
  { status: 403 }
);
setAllowWrite(true);

// --- restore (undoing a delete) -------------------------------------------
reset();
const restored = await restoreRow({
  editable: EDITABLE,
  connection: null,
  values: { ID_iTune: 4, Mail: "a@b.com", PASS: "Cz367599" },
});
check("the restored row's key comes back", restored.pkValue, 99);
const restoreStatement = find(/^\s*INSERT/);
ok(
  "restore writes every snapshot column, including the primary key",
  restoreStatement.text.includes('INSERT INTO "table7" ("ID_iTune", "Mail", "PASS")')
);
check("snapshot values travel as parameters, in order", restoreStatement.params, [
  4,
  "a@b.com",
  "Cz367599",
]);
ok("the restore is committed", statements().at(-1) === "COMMIT");

reset();
await rejects(
  "restoring with no columns is refused",
  restoreRow({ editable: EDITABLE, connection: null, values: {} }),
  { status: 400 }
);
check("nothing was sent to the database", statements(), []);

reset();
await rejects(
  "restore is refused when the query does not allow inserting",
  restoreRow({
    editable: { ...EDITABLE, allowInsert: false },
    connection: null,
    values: { ID_iTune: 4, Mail: "a@b.com" },
  }),
  { status: 403 }
);

setAllowWrite(false);
reset();
await rejects(
  "restore is refused when the database is read-only",
  restoreRow({ editable: EDITABLE, connection: null, values: { ID_iTune: 4, Mail: "a@b.com" } }),
  { status: 403, fragment: "ยังไม่ได้เปิดให้เขียน" }
);
setAllowWrite(true);

// --- the config that gets saved ------------------------------------------
const clean = sanitizeLayout({
  editable: {
    table: "table7",
    pk: "ID_iTune",
    columns: ["Mail", "PASS"],
    allowInsert: "yes",
    allowDelete: true,
    inputs: [
      { column: "Mail", widget: "email", required: true },
      { column: "PASS", widget: "select", options: ["a", "b"], defaultValue: "@today" },
      { column: "secret_flag", widget: "text" },
    ],
  },
});
check("allowInsert must be a real true, not a truthy string", clean.editable.allowInsert, false);
check("allowDelete survives", clean.editable.allowDelete, true);
check("an unknown widget falls back to a text box", clean.editable.inputs[0].widget, "text");
check("a select keeps its options", clean.editable.inputs[1].options, ["a", "b"]);
check(
  "an input for a column that is not writable is dropped",
  clean.editable.inputs.map((input) => input.column),
  ["Mail", "PASS"]
);

const legacy = normalizeLayout({ editable: { table: "t", pk: "id", columns: ["a"] } });
check("a config saved before this cannot insert", legacy.editable.allowInsert, false);
check("a config saved before this cannot delete", legacy.editable.allowDelete, false);
check("a config saved before this has no inputs", legacy.editable.inputs, []);

check(
  "duplicate inputs for one column collapse to the first",
  normalizeInputs([
    { column: "a", widget: "date" },
    { column: "a", widget: "number" },
  ]).map((input) => input.widget),
  ["date"]
);
check("inputs reject a non-array", normalizeInputs("nope"), []);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
