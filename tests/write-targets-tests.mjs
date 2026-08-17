// Writing back to a query that joins: each result column belongs to its own
// table, with its own key, and an edit has to reach that one -- not the base
// table that happens to be named first.
import { updateCell } from "@/server/gamedb-cell-writer.js";
import { insertRow } from "@/server/gamedb-row-writer.js";
import { buildAllSql, buildUpdateSql } from "@/server/gamedb-editable-check.js";
import { log, reset, setResponder } from "@/lib/db.js";
import { setAllowWrite } from "@/server/gamedb-side-tables.js";
import {
  insertTargetsOf,
  normalizeLayout,
  writeTablesOf,
  writeTargetFor,
} from "@/lib/gamedb-layout.js";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

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
  { table: "public.orders", pk: "id", pkColumn: "id", realColumn: "amount" }
);
check(
  "a joined column goes to its own table, with its own key",
  writeTargetFor(JOINED, "name"),
  { table: "public.games", pk: "__key_g_id", pkColumn: "id", realColumn: "name" }
);
check(
  "a column nobody claimed falls back to the base table",
  writeTargetFor(JOINED, "unknown").table,
  "public.orders"
);
check(
  "a config with no targets at all behaves exactly as it did before",
  writeTargetFor({ table: "t", pk: "id", pkColumn: "", columnMap: {} }, "anything"),
  { table: "t", pk: "id", pkColumn: "id", realColumn: "anything" }
);
check(
  "a target with no real name of its own uses its result name, never the base table's",
  writeTargetFor(
    { table: "a", pk: "aid", pkColumn: "real_a_id", targets: [{ table: "b", pk: "bid", pkColumn: "", columns: ["x"] }] },
    "x"
  ),
  { table: "b", pk: "bid", pkColumn: "bid", realColumn: "x" }
);
check("every table it can write to", writeTablesOf(JOINED), ["public.orders", "public.games"]);
check(
  "a stacked query offers no add-a-row at all, since a new row has no half yet",
  insertTargetsOf({ ...JOINED, rowTargets: { sourceColumn: "__src", keyColumn: "__key_row", branches: [] } }),
  []
);
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

// --- adding a row to a query that reads several tables -------------------
check(
  "each table is offered on its own, with its own columns and key",
  insertTargetsOf(JOINED),
  [
    { table: "public.orders", columns: ["amount"], pkColumn: "id" },
    { table: "public.games", columns: ["name"], pkColumn: "id" },
  ]
);

reset();
const addedToGames = await insertRow({
  editable: JOINED,
  connection: null,
  values: { amount: 100, name: "Neverness" },
  table: "public.games",
});
const gamesInsert = log.find((entry) => /^\s*INSERT/i.test(entry.text));
check(
  "asking for the joined table inserts into it",
  gamesInsert.text.includes('INSERT INTO "public"."games" ("name")'),
  true
);
check("with only that table's value bound", gamesInsert.params, ["Neverness"]);
check(
  "and it reports where the row went, so the log records the right table",
  [addedToGames.table, addedToGames.pkColumn],
  ["public.games", "id"]
);

reset();
await insertRow({
  editable: JOINED,
  connection: null,
  values: { amount: 100, name: "Neverness" },
  table: "public.orders",
});
check(
  "asking for the base table still inserts into that",
  log.find((entry) => /^\s*INSERT/i.test(entry.text)).text.includes('INSERT INTO "public"."orders" ("amount")'),
  true
);

// The table name is chosen from the saved config, never quoted from the
// request -- a name that is not in it is refused rather than reached for.
await rejects(
  "a table this query does not write to is refused",
  insertRow({
    editable: JOINED,
    connection: null,
    values: { amount: 1 },
    table: "public.somewhere_else",
  }),
  { status: 400, fragment: "somewhere_else" }
);
await rejects(
  "and so is an injection dressed as a table name",
  insertRow({
    editable: JOINED,
    connection: null,
    values: { amount: 1 },
    table: 'public.orders"; DROP TABLE x --',
  }),
  { status: 400 }
);
await rejects(
  "values for the wrong table are not smuggled in with a right one",
  insertRow({
    editable: JOINED,
    connection: null,
    values: { name: "Neverness" },
    table: "public.orders",
  }),
  { status: 400, fragment: "ไม่มีคอลัมน์" }
);

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

// --- an outer join's unmatched row ---------------------------------------
// A LEFT JOIN leaves the joined table's columns NULL where nothing matched,
// its key included. There is no row of that table to write to, and the write
// must find nothing rather than find something.
reset({ rows: [] });
await rejects(
  "a row whose joined side did not match is not written to",
  updateCell({
    editable: JOINED,
    connection: null,
    pkValue: null,
    column: "name",
    value: "new",
  }),
  { status: 404 }
);
check(
  "the lookup was scoped by the key, so a null one matched no row",
  log.find((entry) => /FOR UPDATE/.test(entry.text))?.params,
  [null]
);
check("and no UPDATE ran", log.some((entry) => /^UPDATE/i.test(entry.text)), false);
check("the transaction was rolled back", log.some((entry) => entry.text === "ROLLBACK"), true);

// --- a stacked query, where the table is a fact about the row ------------
// `SELECT o.id, o.title, ... FROM orders o UNION ALL SELECT g.id, g.name, ...
// FROM games g`, completed with __src and __key_row.
const STACKED = {
  table: "public.orders",
  pk: "__key_row",
  pkColumn: "id",
  columns: ["title", "amount"],
  columnMap: {},
  allowInsert: false,
  allowDelete: false,
  inputs: [],
  rowTargets: {
    sourceColumn: "__src",
    keyColumn: "__key_row",
    branches: [
      { table: "public.orders", pkColumn: "id", columnMap: {} },
      { table: "public.games", pkColumn: "id", columnMap: { title: "name", amount: "price" } },
    ],
  },
};

check(
  "a row from the first half writes to the first table, under its own names",
  writeTargetFor(STACKED, "title", "public.orders"),
  { table: "public.orders", pk: "__key_row", pkColumn: "id", realColumn: "title" }
);
check(
  "a row from the second half writes to the second, under that table's names",
  writeTargetFor(STACKED, "title", "public.games"),
  { table: "public.games", pk: "__key_row", pkColumn: "id", realColumn: "name" }
);
check(
  "the same column, two rows, two tables -- which is the whole point",
  [
    writeTargetFor(STACKED, "amount", "public.orders").realColumn,
    writeTargetFor(STACKED, "amount", "public.games").realColumn,
  ],
  ["amount", "price"]
);
check(
  "a source value naming no branch resolves to nothing at all",
  writeTargetFor(STACKED, "title", "public.somewhere_else"),
  { table: "", pk: "", pkColumn: "", realColumn: "" }
);
check(
  "and so does a row with no source value, rather than falling back",
  writeTargetFor(STACKED, "title", null),
  { table: "", pk: "", pkColumn: "", realColumn: "" }
);

setAllowWrite(true);
reset({ rows: [{ value: "old" }] });
await updateCell({
  editable: STACKED,
  connection: null,
  pkValue: 7,
  column: "title",
  value: "new",
  rowSource: "public.games",
});
check(
  "the write really does follow the row's own half",
  log.find((entry) => /^UPDATE/i.test(entry.text)).text,
  'UPDATE "public"."games" SET "name" = $1 WHERE "id" = $2 RETURNING "name" AS value'
);

reset({ rows: [{ value: "old" }] });
await updateCell({
  editable: STACKED,
  connection: null,
  pkValue: 7,
  column: "title",
  value: "new",
  rowSource: "public.orders",
});
check(
  "and the other half goes to the other table",
  log.find((entry) => /^UPDATE/i.test(entry.text)).text,
  'UPDATE "public"."orders" SET "title" = $1 WHERE "id" = $2 RETURNING "title" AS value'
);

reset({ rows: [{ value: "old" }] });
await rejects(
  "a row this config cannot place is refused rather than written anywhere",
  updateCell({
    editable: STACKED,
    connection: null,
    pkValue: 7,
    column: "title",
    value: "new",
    rowSource: "public.mystery",
  }),
  { status: 409, fragment: "ระบุไม่ได้" }
);
check("and nothing was written", log.some((entry) => /^UPDATE/i.test(entry.text)), false);

// --- the stacked shape through normalize and sanitize --------------------
check(
  "sanitizeLayout keeps the row targets",
  sanitizeLayout({ editable: STACKED }).editable.rowTargets.branches.map((b) => b.table),
  ["public.orders", "public.games"]
);
check(
  "normalizeLayout keeps them too",
  normalizeLayout({ editable: STACKED }).editable.rowTargets.keyColumn,
  "__key_row"
);
check(
  "adding and deleting rows stay off for a stacked query, however it was saved",
  (() => {
    const forced = normalizeLayout({
      editable: { ...STACKED, allowInsert: true, allowDelete: true },
    }).editable;
    return [forced.allowInsert, forced.allowDelete];
  })(),
  [false, false]
);
check(
  "one branch is not a union",
  normalizeLayout({
    editable: { ...STACKED, rowTargets: { ...STACKED.rowTargets, branches: [STACKED.rowTargets.branches[0]] } },
  }).editable.rowTargets,
  null
);
check(
  "two branches naming one table cannot tell their rows apart",
  normalizeLayout({
    editable: {
      ...STACKED,
      rowTargets: {
        ...STACKED.rowTargets,
        branches: [STACKED.rowTargets.branches[0], STACKED.rowTargets.branches[0]],
      },
    },
  }).editable.rowTargets,
  null
);
check(
  "a branch whose table cannot be quoted takes the whole set with it",
  sanitizeLayout({
    editable: {
      ...STACKED,
      rowTargets: {
        ...STACKED.rowTargets,
        branches: [
          STACKED.rowTargets.branches[0],
          { ...STACKED.rowTargets.branches[1], table: 'games"; DROP TABLE x --' },
        ],
      },
    },
  }).editable.rowTargets,
  null
);
check(
  "and so does a mapping that cannot be quoted",
  sanitizeLayout({
    editable: {
      ...STACKED,
      rowTargets: {
        ...STACKED.rowTargets,
        branches: [
          STACKED.rowTargets.branches[0],
          { ...STACKED.rowTargets.branches[1], columnMap: { title: 'name"; --' } },
        ],
      },
    },
  }).editable.rowTargets,
  null
);

// The preview has to describe every half, or it describes a write that never
// happens to half the rows.
const stackedPreview = buildAllSql(STACKED);
check("a stacked config previews editing only", stackedPreview.map((g) => g.action), [
  "แก้ค่าในช่อง (UPDATE)",
]);
const stackedTitle = stackedPreview[0].statements.find((s) => s.label === "title").sql;
check(
  "with one statement per half",
  [
    stackedTitle.includes('UPDATE "public"."orders" SET "title"'),
    stackedTitle.includes('UPDATE "public"."games" SET "name"'),
  ],
  [true, true]
);
check(
  "and says which source value picks which",
  stackedTitle.includes("__src = 'public.games'"),
  true
);

setResponder(null);
console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
