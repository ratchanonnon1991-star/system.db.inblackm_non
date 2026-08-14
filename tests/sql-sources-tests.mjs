// Working out which real table each result column came from, so the editable
// settings can be proposed instead of typed in by hand.
import {
  detectEditableTargets,
  parseFromTables,
  parseSelectSources,
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
    columns: [
      { name: "id" },
      { name: "game_id" },
      { name: "amount" },
      { name: "created_at" },
    ],
  },
  {
    key: "public.games",
    schema: "public",
    name: "games",
    primaryKey: ["id"],
    columns: [{ name: "id" }, { name: "name" }, { name: "ชื่อไทย" }],
  },
  {
    key: "public.notes",
    schema: "public",
    name: "notes",
    primaryKey: ["a", "b"],
    columns: [{ name: "a" }, { name: "b" }, { name: "body" }],
  },
  // Same table name in another schema, to prove an unqualified name that two
  // schemas answer to is refused rather than picked at random.
  {
    key: "archive.orders",
    schema: "archive",
    name: "orders",
    primaryKey: ["id"],
    columns: [{ name: "id" }, { name: "amount" }],
  },
];

const names = (list) => list.map((entry) => `${entry.schema}.${entry.name} AS ${entry.alias}`);

// --- FROM / JOIN ---------------------------------------------------------
check(
  "a plain FROM",
  names(parseFromTables("SELECT * FROM public.orders")),
  ["public.orders AS orders"]
);
check(
  "an aliased FROM with AS",
  names(parseFromTables("SELECT * FROM public.orders AS o")),
  ["public.orders AS o"]
);
check(
  "an aliased FROM without AS",
  names(parseFromTables("SELECT * FROM public.orders o")),
  ["public.orders AS o"]
);
check(
  "a join picks up both sides",
  names(parseFromTables("SELECT * FROM public.orders o JOIN public.games g ON o.game_id = g.id")),
  ["public.orders AS o", "public.games AS g"]
);
check(
  "LEFT/INNER joins too",
  names(
    parseFromTables(
      "SELECT * FROM public.orders o LEFT JOIN public.games g ON o.game_id = g.id INNER JOIN public.notes n ON n.a = o.id"
    )
  ),
  ["public.orders AS o", "public.games AS g", "public.notes AS n"]
);
check(
  "ON is never mistaken for an alias",
  parseFromTables("SELECT * FROM public.orders JOIN public.games ON orders.game_id = games.id")[0]
    .alias,
  "orders"
);
check(
  "WHERE is never mistaken for an alias",
  parseFromTables("SELECT * FROM public.orders WHERE id = 1")[0].alias,
  "orders"
);
check(
  "a derived table has nothing to write back to",
  parseFromTables("SELECT * FROM (SELECT 1) AS x"),
  []
);
check(
  "a FROM inside a subquery is not a table of the outer query",
  names(parseFromTables("SELECT * FROM public.orders o WHERE id IN (SELECT id FROM public.games)")),
  ["public.orders AS o"]
);
check(
  "the word from inside a string literal is not a clause",
  names(parseFromTables("SELECT 'from public.games' AS x FROM public.orders")),
  ["public.orders AS orders"]
);
check("quoted table names survive", names(parseFromTables('SELECT * FROM "public"."orders"')), [
  "public.orders AS orders",
]);

// --- SELECT list ---------------------------------------------------------
const sourcesOf = (sql) =>
  parseSelectSources(sql).map((item) => `${item.result}<-${item.qualifier}.${item.column}`);

check("a qualified column", sourcesOf("SELECT o.id FROM t"), ["id<-o.id"]);
check("a bare column", sourcesOf("SELECT id FROM t"), ["id<-.id"]);
check("an AS alias", sourcesOf("SELECT o.id AS order_id FROM t"), ["order_id<-o.id"]);
check("a quoted Thai alias", sourcesOf('SELECT g.name AS "ชื่อเกม" FROM t'), ["ชื่อเกม<-g.name"]);
check("an alias without AS", sourcesOf("SELECT o.id order_id FROM t"), ["order_id<-o.id"]);
check("several items", sourcesOf("SELECT a.col1, b.col2 FROM t"), ["col1<-a.col1", "col2<-b.col2"]);
check("a star", sourcesOf("SELECT * FROM t"), ["*<-.*"]);
check("a qualified star", sourcesOf("SELECT b.* FROM t"), ["*<-b.*"]);
check(
  "an expression has no single source column",
  sourcesOf("SELECT price * 2 AS doubled FROM t"),
  ["doubled<-."]
);
check(
  "a function call with a comma inside does not split the list",
  sourcesOf("SELECT coalesce(a.x, 0) AS x, b.y FROM t"),
  ["x<-.", "y<-b.y"]
);

// --- the whole proposal --------------------------------------------------
const joined = detectEditableTargets({
  sql: "SELECT o.id, o.amount, g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id",
  tables: TABLES,
});
check(
  "a join offers both tables, the one it is mostly about first",
  joined.map((target) => [target.key, target.columns.length]),
  [
    ["public.orders", 2],
    ["public.games", 1],
  ]
);
check("the primary key is found from the schema", joined[0].primaryKey, "id");
check("and so is the result column exposing it", joined[0].pkResultColumn, "id");
check(
  "each target knows which result columns are its own",
  joined[0].columns,
  [
    { result: "id", column: "id" },
    { result: "amount", column: "amount" },
  ]
);
check(
  "the joined table's columns are not attributed to the base table",
  joined[1].columns,
  [{ result: "name", column: "name" }]
);

// This is the case the whole thing exists for: editing the *joined* table.
const editingJoined = detectEditableTargets({
  sql: "SELECT a.col1, b.col2 FROM public.orders a JOIN public.games b ON a.game_id = b.id",
  tables: [
    { key: "public.orders", schema: "public", name: "orders", primaryKey: ["id"], columns: [{ name: "col1" }, { name: "id" }, { name: "game_id" }] },
    { key: "public.games", schema: "public", name: "games", primaryKey: ["id"], columns: [{ name: "col2" }, { name: "id" }] },
  ],
});
check(
  "picking the joined table gives its own key, not the base table's",
  editingJoined.map((target) => [target.key, target.primaryKey]),
  [
    ["public.orders", "id"],
    ["public.games", "id"],
  ]
);

// An alias renames the result column; the real column name has to survive.
const aliased = detectEditableTargets({
  sql: 'SELECT o.id AS "รหัส", o.amount AS "ยอด" FROM public.orders o',
  tables: TABLES,
});
check(
  "an aliased result column keeps a route back to the real column",
  aliased[0].columns,
  [
    { result: "รหัส", column: "id" },
    { result: "ยอด", column: "amount" },
  ]
);
check("the key is matched by real column, not by label", aliased[0].pkResultColumn, "รหัส");

// SELECT * is extremely common and should still work.
const starred = detectEditableTargets({
  sql: "SELECT * FROM public.games",
  tables: TABLES,
});
check(
  "a star expands from the schema",
  starred[0].columns.map((entry) => entry.result),
  ["id", "name", "ชื่อไทย"]
);
check("and still finds the key", starred[0].pkResultColumn, "id");

// Without the key in the result there is no way to identify a row.
const noKey = detectEditableTargets({
  sql: "SELECT o.amount FROM public.orders o",
  tables: TABLES,
});
check("a query that omits the key says so", noKey[0].pkResultColumn, "");
check("...but still knows what the key is", noKey[0].primaryKey, "id");

// A composite key cannot be expressed by the single-pk editable config.
const composite = detectEditableTargets({
  sql: "SELECT n.a, n.body FROM public.notes n",
  tables: TABLES,
});
check("a composite key is flagged rather than half-used", composite[0].compositeKey, true);
check("and no single key is claimed", composite[0].primaryKey, "");

// Ambiguity must never resolve to a guess.
const ambiguousColumn = detectEditableTargets({
  sql: "SELECT id FROM public.orders o JOIN public.games g ON o.game_id = g.id",
  tables: TABLES,
});
check(
  "a bare column both joined tables have is left unattributed",
  ambiguousColumn.map((target) => target.columns.length),
  []
);
check(
  "an unqualified table name two schemas answer to is refused",
  detectEditableTargets({ sql: "SELECT id FROM orders", tables: TABLES }),
  []
);
check(
  "a bare column only one joined table has is attributed to it",
  detectEditableTargets({
    sql: "SELECT amount, name FROM public.orders o JOIN public.games g ON o.game_id = g.id",
    tables: TABLES,
  }).map((target) => [target.key, target.columns.map((entry) => entry.result)]),
  [
    ["public.orders", ["amount"]],
    ["public.games", ["name"]],
  ]
);

check("an unknown table proposes nothing", detectEditableTargets({ sql: "SELECT * FROM nope.nope", tables: TABLES }), []);
check("no schema loaded means no proposal", detectEditableTargets({ sql: "SELECT * FROM public.orders", tables: [] }), []);
check("nonsense in, nothing out", detectEditableTargets({ sql: "not sql at all", tables: TABLES }), []);
check("empty sql", detectEditableTargets({ sql: "", tables: TABLES }), []);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
