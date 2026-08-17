// A spread of query shapes people actually write, run through the whole
// reading pipeline. The unit tests next door check one behaviour at a time;
// this checks that a real query comes out the other end with the right answer
// -- and, for the shapes where there is no right answer, with none at all.
import {
  addMissingKeyColumns,
  checkJoinQualification,
  detectEditableTargets,
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
    columns: [
      { name: "id" }, { name: "game_id" }, { name: "amount" },
      { name: "status" }, { name: "created_at" },
    ],
  },
  {
    key: "public.games",
    schema: "public",
    name: "games",
    primaryKey: ["id"],
    uniqueKeys: ["slug"],
    columns: [{ name: "id" }, { name: "name" }, { name: "slug" }, { name: "ชื่อไทย" }],
  },
  {
    // No primary key at all -- identified by a NOT NULL unique column.
    key: "public.users",
    schema: "public",
    name: "users",
    primaryKey: [],
    uniqueKeys: ["email"],
    columns: [{ name: "email" }, { name: "display_name" }, { name: "order_id" }],
  },
];

/** Each target as "table/key(in result)/columns", the whole answer in one line. */
const readOf = (sql) =>
  detectEditableTargets({ sql, tables: TABLES }).map(
    (target) =>
      `${target.key}|${target.alias}|${target.primaryKey || "-"}|${
        target.pkResultColumn || "-"
      }|${target.columns.map((entry) => entry.result).join(",")}`
  );

// --- shapes that read cleanly --------------------------------------------
check("a plain single-table query", readOf("SELECT id, name FROM public.games"), [
  "public.games|games|id|id|id,name",
]);
check("a star expands to the real columns", readOf("SELECT * FROM public.games"), [
  "public.games|games|id|id|id,name,slug,ชื่อไทย",
]);
check(
  "a two-table join keeps each side to itself",
  readOf(`SELECT o.id, o.amount, g.name AS game, u.display_name
    FROM public.orders o
    JOIN public.games g ON g.id = o.game_id
    LEFT JOIN public.users u ON u.order_id = o.id`),
  [
    "public.orders|o|id|id|id,amount",
    "public.games|g|id|-|game",
    "public.users|u|email|-|display_name",
  ]
);
check(
  "an expression sits alongside real columns without disturbing them",
  readOf(`SELECT o.id, CASE WHEN o.amount > 100 THEN 'big' ELSE 'small' END AS size
    FROM public.orders o`),
  ["public.orders|o|id|id|id"]
);
check(
  "a window function is an expression like any other",
  readOf(`SELECT o.id, o.amount,
    row_number() OVER (PARTITION BY o.game_id ORDER BY o.created_at) AS rn
    FROM public.orders o`),
  ["public.orders|o|id|id|id,amount"]
);
check(
  "a scalar subquery in the SELECT list does not become a table",
  readOf(`SELECT o.id, (SELECT count(*) FROM public.games) AS games, o.amount
    FROM public.orders o`),
  ["public.orders|o|id|id|id,amount"]
);
check(
  "nor does a subquery in the WHERE",
  readOf(`SELECT o.id, o.amount FROM public.orders o
    WHERE o.game_id IN (SELECT id FROM public.games)`),
  ["public.orders|o|id|id|id,amount"]
);
check(
  "a comment before the query is not the query",
  readOf("-- daily orders\n    SELECT o.id, o.amount FROM public.orders o"),
  ["public.orders|o|id|id|id,amount"]
);
check(
  "a keyword inside a string literal is data",
  readOf("SELECT o.id, 'from public.games join x' AS note FROM public.orders o"),
  ["public.orders|o|id|id|id"]
);
check(
  "a Thai column under a Thai alias keeps both names straight",
  detectEditableTargets({
    sql: 'SELECT g.id, g."ชื่อไทย" AS "ชื่อเกม" FROM public.games g',
    tables: TABLES,
  })[0].columns,
  [
    { result: "id", column: "id" },
    { result: "ชื่อเกม", column: "ชื่อไทย" },
  ]
);
check(
  "case folding is applied the way Postgres applies it",
  readOf("SELECT O.Id, O.Amount FROM Public.Orders AS O"),
  ["public.orders|O|id|id|id,amount"]
);
check(
  "a trailing semicolon changes nothing",
  readOf("SELECT id, name FROM public.games;"),
  ["public.games|games|id|id|id,name"]
);
check(
  "ORDER BY and LIMIT are not part of the SELECT list",
  readOf("SELECT o.id, o.amount FROM public.orders o ORDER BY o.created_at DESC LIMIT 50"),
  ["public.orders|o|id|id|id,amount"]
);
check(
  "a named parameter is not mistaken for anything",
  readOf("SELECT o.id, o.amount FROM public.orders o WHERE o.status = :status"),
  ["public.orders|o|id|id|id,amount"]
);
check(
  "a table identified by a unique column instead of a key",
  readOf("SELECT u.email, u.display_name FROM public.users u"),
  ["public.users|u|email|email|email,display_name"]
);

// --- the same table joined to itself -------------------------------------
// Two entries, two rows, two keys. Merging them would give b's columns a's
// key: a real row of the right table, and the wrong one.
check(
  "a self-join is two separate targets, each with its own key",
  readOf(`SELECT a.id AS parent_id, b.id AS child_id, b.amount
    FROM public.orders a JOIN public.orders b ON b.game_id = a.id`),
  [
    "public.orders|b|id|child_id|child_id,amount",
    "public.orders|a|id|parent_id|parent_id",
  ]
);
check(
  "and an unqualified column in a self-join belongs to neither",
  readOf("SELECT amount FROM public.orders a JOIN public.orders b ON b.game_id = a.id"),
  []
);

// --- shapes with no honest answer ----------------------------------------
check(
  "a set operation is refused outright, both halves of it",
  readOf(`SELECT o.id, o.amount FROM public.orders o
    UNION ALL SELECT g.id, 0 FROM public.games g`),
  []
);
check(
  "INTERSECT too",
  readOf("SELECT o.id FROM public.orders o INTERSECT SELECT g.id FROM public.games g"),
  []
);
check(
  "a CTE is not a table anything can be written back to",
  readOf(`WITH recent AS (SELECT * FROM public.orders WHERE amount > 0)
    SELECT r.id, r.amount FROM recent r`),
  []
);
check(
  "neither is a derived table",
  readOf("SELECT t.id, t.amount FROM (SELECT * FROM public.orders) t"),
  []
);
check(
  "but a real table joined to one still reads",
  readOf("SELECT t.n, g.name, g.id FROM (SELECT 1 AS n) t JOIN public.games g ON true"),
  ["public.games|g|id|id|name,id"]
);
check(
  "a LATERAL subquery's columns belong to the subquery, not to a table",
  readOf(`SELECT o.id, x.name
    FROM public.orders o, LATERAL (SELECT name FROM public.games WHERE id = o.game_id) x`),
  ["public.orders|o|id|id|id"]
);
check(
  "a query of nothing but expressions attributes nothing",
  readOf(`SELECT CASE WHEN amount > 1 THEN 'y' ELSE 'n' END AS flag,
    upper(status) AS st FROM public.orders`),
  []
);
check(
  "casts and concatenation are expressions as well",
  readOf("SELECT o.id::text AS id_text, o.status || '!' AS shout FROM public.orders o"),
  []
);
check(
  "two columns coming back under one name belong to nobody",
  readOf("SELECT o.id, g.id FROM public.orders o JOIN public.games g ON g.id = o.game_id"),
  []
);

// --- what the save gate says about each ----------------------------------
const gateOf = (sql) => {
  const result = checkJoinQualification(sql);
  return result.needed
    ? [result.ok, result.missingAlias, result.unqualified, result.duplicateResults]
    : "not needed";
};
check("a single-table query is asked nothing", gateOf("SELECT id FROM public.games"), "not needed");
check(
  "a properly written join passes",
  gateOf("SELECT o.id, g.name FROM public.orders o JOIN public.games g ON g.id = o.game_id"),
  [true, [], [], []]
);
check(
  "bare columns in a join are named",
  gateOf("SELECT amount, name FROM public.orders o JOIN public.games g ON g.id = o.game_id"),
  [false, [], ["amount", "name"], []]
);
check(
  "a duplicated result name is named",
  gateOf("SELECT o.id, g.id FROM public.orders o JOIN public.games g ON g.id = o.game_id"),
  [false, [], [], ["id"]]
);
check(
  "a join with a self-join reads as fine when aliased apart",
  gateOf(`SELECT a.id AS parent_id, b.id AS child_id
    FROM public.orders a JOIN public.orders b ON b.game_id = a.id`),
  [true, [], [], []]
);

// --- completing a query so its joined tables can be edited ---------------
const completionOf = (sql) => {
  const result = addMissingKeyColumns({ sql, tables: TABLES });
  return [result.added.map((entry) => `${entry.table}->${entry.alias}`), result.refused.length > 0];
};
check(
  "both joined tables get the key they were missing",
  completionOf(`SELECT o.id, o.amount, g.name AS game, u.display_name
    FROM public.orders o
    JOIN public.games g ON g.id = o.game_id
    LEFT JOIN public.users u ON u.order_id = o.id`),
  [["public.games->__key_g_id", "public.users->__key_u_email"], false]
);
check(
  "including the unique column standing in for a missing primary key",
  completionOf("SELECT o.id, u.display_name FROM public.orders o JOIN public.users u ON u.order_id = o.id"),
  [["public.users->__key_u_email"], false]
);
check(
  "two stars leave both keys ambiguous, and both get one of their own",
  completionOf("SELECT o.*, g.* FROM public.orders o JOIN public.games g ON g.id = o.game_id"),
  [["public.orders->__key_o_id", "public.games->__key_g_id"], false]
);
check(
  "a set operation is not completed, since it is not editable either way",
  completionOf(`SELECT o.id FROM public.orders o
    UNION SELECT g.id FROM public.games g`),
  [[], false]
);
check(
  "and neither is a GROUP BY, where an extra column changes the rows",
  addMissingKeyColumns({
    sql: `SELECT g.name, sum(o.amount) AS total FROM public.orders o
      JOIN public.games g ON g.id = o.game_id GROUP BY g.name`,
    tables: TABLES,
  }).refused.length > 0,
  true
);
check(
  "a query that already has everything is left alone",
  completionOf("SELECT o.id, o.amount FROM public.orders o"),
  [[], false]
);

// The completed query has to actually be readable, or the completion is a
// rewrite that helps nobody.
const completed = addMissingKeyColumns({
  sql: "SELECT o.id, o.amount, g.name FROM public.orders o JOIN public.games g ON g.id = o.game_id",
  tables: TABLES,
}).sql;
check(
  "and after completion every table has a key in the result",
  detectEditableTargets({ sql: completed, tables: TABLES }).map(
    (target) => `${target.key}|${target.pkResultColumn}`
  ),
  ["public.orders|id", "public.games|__key_g_id"]
);
check(
  "running it a second time adds nothing further",
  addMissingKeyColumns({ sql: completed, tables: TABLES }).added,
  []
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
