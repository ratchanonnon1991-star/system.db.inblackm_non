// Writing back to a query that joins: each result column belongs to its own
// table, with its own key, and an edit has to reach that one -- not the base
// table that happens to be named first.
import { updateCell } from "@/server/gamedb-cell-writer.js";
import { insertRow } from "@/server/gamedb-row-writer.js";
import { buildAllSql, buildUpdateSql } from "@/server/gamedb-editable-check.js";
import { log, reset, setResponder } from "@/lib/db.js";
import { setAllowWrite } from "@/server/gamedb-side-tables.js";
import { normalizeLayout, writeTablesOf, writeTargetFor } from "@/lib/gamedb-layout.js";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

// `SELECT o.id, o.amount, g.name, g.id AS __key_g_id FROM orders o JOIN games g`
const JOINED = {
  table: "public.orders",
  pk: "id",
  pkColumn: "id",
  columns: ["amount", "name"],
  columnMap: {},
  allowInsert: true,
  allowDelete: false,
  inputs: [],
  targets: [
    {
      table: "public.games",
      pk: "__key_g_id",
      pkColumn: "id",
      columns: ["name"],
    },
  ],
};

// --- which table a column goes to ----------------------------------------
check(
  "a base column goes to the base table",
  writeTargetFor(JOINED, "amount"),
  { table: "public.orders", pk: "id", pkColumn: "id" }
);
check(
  "a joined column goes to its own table, with its own key",
  writeTargetFor(JOINED, "name"),
  { table: "public.games", pk: "__key_g_id", pkColumn: "id" }
);
check(
  "a column nobody claimed falls back to the base table",
  writeTargetFor(JOINED, "unknown").table,
  "public.orders"
);
check(
  "a config with no targets at all behaves exactly as it did before",
  writeTargetFor({ table: "t", pk: "id", pkColumn: "", columnMap: {} }, "anything"),
  { table: "t", pk: "id", pkColumn: "id" }
);
check(
  "a target with no real name of its own uses its result name, never the base table's",
  writeTargetFor(
    { table: "a", pk: "aid", pkColumn: "real_a_id", targets: [{ table: "b", pk: "bid", pkColumn: "", columns: ["x"] }] },
    "x"
  ),
  { table: "b", pk: "bid", pkColumn: "bid" }
);
check("every table it can write to", writeTablesOf(JOINED), ["public.orders", "public.games"]);
check("and none at all without a table", writeTablesOf(null), []);

// --- what actually reaches SQL -------------------------------------------
setAllowWrite(true);
reset({ rows: [{ value: "old" }] });
await updateCell({
  editable: JOINED,
  connection: null,
  pkValue: 9,
  column: "name",
  value: "new",
});
const joinedUpdate = log.find((entry) => /^UPDATE/i.test(entry.text));
check(
  "editing the joined column updates the joined table",
  joinedUpdate.text,
  'UPDATE "public"."games" SET "name" = $1 WHERE "id" = $2 RETURNING "name" AS value'
);
check("bound with the value and that table's key", joinedUpdate.params, ["new", 9]);

reset({ rows: [{ value: 1 }] });
await updateCell({
  editable: JOINED,
  connection: null,
  pkValue: 4,
  column: "amount",
  value: 250,
});
check(
  "editing the base column still updates the base table",
  log.find((entry) => /^UPDATE/i.test(entry.text)).text,
  'UPDATE "public"."orders" SET "amount" = $1 WHERE "id" = $2 RETURNING "amount" AS value'
);

// --- adding a row --------------------------------------------------------
// A row is added to one table. A joined table's column has no place in that
// INSERT: Postgres would reject it, or -- if the base table happens to have a
// column by the same name -- accept it and write to entirely the wrong thing.
reset();
await insertRow({
  editable: JOINED,
  connection: null,
  values: { amount: 100, name: "Neverness" },
});
const inserted = log.find((entry) => /^\s*INSERT/i.test(entry.text));
check("the insert goes to the base table only", inserted.text.includes('"public"."orders"'), true);
check("with the base table's column", inserted.text.includes('"amount"'), true);
check("and not the joined table's", inserted.text.includes('"name"'), false);
check("so only the base value is bound", inserted.params, [100]);

// --- what the preview shows ----------------------------------------------
check(
  "the update preview names the joined table",
  buildUpdateSql(JOINED, "name").table,
  "public.games"
);
const preview = buildAllSql(JOINED);
const updateGroup = preview.find((group) => group.action.startsWith("แก้ค่าในช่อง"));
check(
  "and labels the column with where it lands",
  updateGroup.statements.map((statement) => statement.label),
  ["amount", "name (ในตาราง public.games)"]
);
const insertGroup = preview.find((group) => group.action.startsWith("เพิ่มแถวใหม่"));
check(
  "the insert preview lists only the base table's columns",
  insertGroup.statements[0].sql.includes('"name"'),
  false
);

// --- the layout shape survives a round trip ------------------------------
const roundTrip = sanitizeLayout({ editable: JOINED });
check("sanitizeLayout keeps the targets", roundTrip.editable.targets, JOINED.targets);
check(
  "normalizeLayout keeps them too",
  normalizeLayout(roundTrip).editable.targets[0].table,
  "public.games"
);
check(
  "a layout with no targets reads as an empty list, not undefined",
  normalizeLayout({ editable: { table: "t", pk: "id", columns: [] } }).editable.targets,
  []
);

// A target names a table and a key that get quoted straight into an UPDATE.
check(
  "a target whose table cannot be quoted is dropped",
  sanitizeLayout({
    editable: { ...JOINED, targets: [{ ...JOINED.targets[0], table: 'games"; DROP TABLE x --' }] },
  }).editable.targets,
  []
);
check(
  "so is one whose key cannot be quoted",
  sanitizeLayout({
    editable: { ...JOINED, targets: [{ ...JOINED.targets[0], pkColumn: "id); DELETE FROM x --" }] },
  }).editable.targets,
  []
);
check(
  "a target claiming a column that is not editable claims nothing, and goes",
  sanitizeLayout({
    editable: { ...JOINED, targets: [{ ...JOINED.targets[0], columns: ["not_editable"] }] },
  }).editable.targets,
  []
);
check(
  "and a dropped target leaves its columns on the base table rather than unwritable",
  writeTargetFor(
    sanitizeLayout({
      editable: { ...JOINED, targets: [{ ...JOINED.targets[0], table: 'bad"name' }] },
    }).editable,
    "name"
  ).table,
  "public.orders"
);

setResponder(null);
console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
