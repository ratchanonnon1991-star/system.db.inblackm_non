// A stacked query returns one set of columns holding rows from different
// tables, so which table an edit belongs to is a fact about the row, not
// about the column. These are the two halves of making that work: reading a
// UNION per branch, and writing the columns that record it back into the SQL.
import {
  addUnionRowSource,
  detectUnionTargets,
  splitSetOperationBranches,
} from "@/lib/gamedb-sql-sources.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const TABLES = [
  {
    key: "public.orders",
    schema: "public",
    name: "orders",
    primaryKey: ["id"],
    uniqueKeys: [],
    columns: [{ name: "id" }, { name: "title" }, { name: "amount" }],
  },
  {
    key: "public.games",
    schema: "public",
    name: "games",
    primaryKey: ["id"],
    uniqueKeys: [],
    columns: [{ name: "id" }, { name: "name" }, { name: "price" }],
  },
  {
    key: "public.notes",
    schema: "public",
    name: "notes",
    primaryKey: ["a", "b"],
    uniqueKeys: [],
    columns: [{ name: "a" }, { name: "b" }, { name: "body" }],
  },
];

// --- cutting a query into its halves -------------------------------------
check(
  "a plain query has no branches",
  splitSetOperationBranches("SELECT id FROM public.games"),
  []
);
check(
  "a UNION has two",
  splitSetOperationBranches("SELECT a FROM x UNION SELECT b FROM y").map((b) => [b.op, b.sql.trim()]),
  [
    ["", "SELECT a FROM x"],
    ["union", "SELECT b FROM y"],
  ]
);
check(
  "ALL belongs to the operator, not to the branch",
  splitSetOperationBranches("SELECT a FROM x UNION ALL SELECT b FROM y").map((b) => [
    b.opText,
    b.sql.trim(),
  ]),
  [
    ["", "SELECT a FROM x"],
    ["UNION ALL", "SELECT b FROM y"],
  ]
);
check(
  "three branches",
  splitSetOperationBranches("SELECT a FROM x UNION SELECT b FROM y UNION SELECT c FROM z").length,
  3
);
check(
  "a UNION inside parentheses belongs to the subquery",
  splitSetOperationBranches("SELECT a FROM (SELECT 1 UNION SELECT 2) t"),
  []
);
check(
  "and the word inside a literal is not an operator",
  splitSetOperationBranches("SELECT 'union select' AS note FROM x"),
  []
);

// --- reading one -------------------------------------------------------
const SIMPLE = `SELECT o.id, o.title, o.amount FROM public.orders o
UNION ALL
SELECT g.id, g.name, g.price FROM public.games g`;
const read = detectUnionTargets({ sql: SIMPLE, tables: TABLES });
check("a two-table UNION reads", read.ok, true);
check("each branch knows its table", read.branches.map((b) => b.table), [
  "public.orders",
  "public.games",
]);
check("and its own key", read.branches.map((b) => b.primaryKey), ["id", "id"]);
// The result names come from the first branch whatever the second calls its
// columns, so the branches are lined up by position.
check(
  "the second branch maps the first branch's names to its own columns",
  read.branches[1].columnMap,
  { id: "id", title: "name", amount: "price" }
);
check(
  "and the editable columns are the ones every branch can write",
  read.columns,
  ["title", "amount"]
);
check("the key column is not offered as editable", read.columns.includes("id"), false);
check("nothing has been written into the query yet", [read.hasSourceColumn, read.hasKeyColumn], [
  false,
  false,
]);

// --- what it will not read ----------------------------------------------
const refusal = (sql) => detectUnionTargets({ sql, tables: TABLES });
check("a plain query is not a UNION at all", refusal("SELECT id FROM public.games"), null);
check(
  "INTERSECT has no answer to record",
  refusal("SELECT o.id FROM public.orders o INTERSECT SELECT g.id FROM public.games g").ok,
  false
);
check(
  "EXCEPT neither",
  refusal("SELECT o.id FROM public.orders o EXCEPT SELECT g.id FROM public.games g").ok,
  false
);
check(
  "a branch that joins is not supported yet",
  refusal(`SELECT o.id FROM public.orders o JOIN public.games g ON g.id = o.id
    UNION SELECT g.id FROM public.games g`).ok,
  false
);
check(
  "a star cannot be lined up by position",
  refusal("SELECT * FROM public.orders UNION SELECT * FROM public.games").ok,
  false
);
check(
  "branches of different widths cannot either",
  refusal(`SELECT o.id, o.title FROM public.orders o
    UNION SELECT g.id FROM public.games g`).ok,
  false
);
check(
  "a branch with no way to identify a row",
  refusal(`SELECT n.a, n.body FROM public.notes n
    UNION SELECT g.id, g.name FROM public.games g`).ok,
  false
);
check(
  "the same table on both sides says nothing about which half a row came from",
  refusal(`SELECT o.id, o.title FROM public.orders o
    UNION SELECT o2.id, o2.title FROM public.orders o2`).ok,
  false
);

// --- writing the two columns in --------------------------------------
const completed = addUnionRowSource({ sql: SIMPLE, tables: TABLES });
check(
  "both branches gain a source name and a key, at the same position",
  completed.sql,
  `SELECT o.id, o.title, o.amount, 'public.orders' AS "__src", o."id" AS "__key_row"
FROM public.orders o
UNION ALL SELECT g.id, g.name, g.price, 'public.games' AS "__src", g."id" AS "__key_row"
FROM public.games g`
);
check("and it reports what it did", completed.added, [
  { table: "public.orders", column: "id" },
  { table: "public.games", column: "id" },
]);
check(
  "the rewritten query reads as complete",
  (() => {
    const after = detectUnionTargets({ sql: completed.sql, tables: TABLES });
    return [after.ok, after.hasSourceColumn, after.hasKeyColumn, after.columns];
  })(),
  [true, true, true, ["title", "amount"]]
);
check(
  "running it again adds nothing",
  addUnionRowSource({ sql: completed.sql, tables: TABLES }).added,
  []
);
check(
  "a query it cannot read is left alone, with the reason",
  (() => {
    const attempt = addUnionRowSource({
      sql: "SELECT * FROM public.orders UNION SELECT * FROM public.games",
      tables: TABLES,
    });
    return [attempt.added, attempt.reason.length > 0];
  })(),
  [[], true]
);
check(
  "and so is a query that is not a UNION",
  addUnionRowSource({ sql: "SELECT id FROM public.games", tables: TABLES }).added,
  []
);

// --- more shapes ---------------------------------------------------------
check(
  "three branches all read",
  (() => {
    const three = detectUnionTargets({
      sql: `SELECT o.id, o.title FROM public.orders o
        UNION SELECT g.id, g.name FROM public.games g
        UNION SELECT n.a, n.body FROM public.notes n`,
      tables: TABLES,
    });
    // notes has a composite key and nothing unique, so it has no row identity.
    return [three.ok, three.reason.includes("public.notes")];
  })(),
  [false, true]
);
check(
  "aliases in later branches do not have to match the first",
  detectUnionTargets({
    sql: `SELECT o.id AS ref, o.title AS label FROM public.orders o
      UNION SELECT g.id AS whatever, g.name AS ignored FROM public.games g`,
    tables: TABLES,
  }).columns,
  ["label"]
);
check(
  "...and the names that survive are the first branch's",
  detectUnionTargets({
    sql: `SELECT o.id AS ref, o.title AS label FROM public.orders o
      UNION SELECT g.id AS whatever, g.name AS ignored FROM public.games g`,
    tables: TABLES,
  }).branches[1].columnMap,
  { ref: "id", label: "name" },
);
check(
  "a position that is an expression in one branch is not editable in any",
  detectUnionTargets({
    sql: `SELECT o.id, o.title FROM public.orders o
      UNION SELECT g.id, 'ไม่ระบุ' AS name FROM public.games g`,
    tables: TABLES,
  }).columns,
  []
);
check(
  "a WHERE in a branch changes nothing about where its rows go",
  detectUnionTargets({
    sql: `SELECT o.id, o.title FROM public.orders o WHERE o.amount > 0
      UNION SELECT g.id, g.name FROM public.games g WHERE g.price > 0`,
    tables: TABLES,
  }).columns,
  ["title"]
);
check(
  "a comment between the branches is not a branch",
  splitSetOperationBranches(`SELECT a FROM x
    -- everything below is the second half
    UNION SELECT b FROM y`).length,
  2
);
check(
  "a branch with a subquery in its WHERE still reads as one table",
  detectUnionTargets({
    sql: `SELECT o.id, o.title FROM public.orders o WHERE o.id IN (SELECT id FROM public.games)
      UNION SELECT g.id, g.name FROM public.games g`,
    tables: TABLES,
  }).ok,
  true
);
check(
  "quoted and mixed-case table names resolve the same as anywhere else",
  detectUnionTargets({
    sql: `SELECT O.Id, O.Title FROM Public.Orders O
      UNION SELECT g.id, g.name FROM "public"."games" g`,
    tables: TABLES,
  }).branches.map((branch) => branch.table),
  ["public.orders", "public.games"]
);
check(
  "the completion keeps ORDER BY where it belongs -- at the end, not inside a branch",
  addUnionRowSource({
    sql: `SELECT o.id, o.title FROM public.orders o
UNION ALL
SELECT g.id, g.name FROM public.games g
ORDER BY 2`,
    tables: TABLES,
  }).sql.trimEnd().endsWith("ORDER BY 2"),
  true
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
