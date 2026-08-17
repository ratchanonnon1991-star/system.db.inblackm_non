// Working out which real table each result column came from, so the editable
// settings can be proposed instead of typed in by hand.
import {
  addMissingKeyColumns,
  detectEditableTargets,
  parseFromTables,
  checkJoinQualification,
  parseSelectSources,
  resolveQueryTables,
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

// --- regressions ---------------------------------------------------------
// A subquery written without a space after FROM used to have its opening
// paren skipped, so the depth counter went negative on the closing one and
// every table joined after it was lost.
check(
  "FROM( with no space still opens a paren",
  parseFromTables("SELECT * FROM(SELECT 1) AS x"),
  []
);
check(
  "...and does not swallow the tables joined after it",
  names(parseFromTables("SELECT * FROM(SELECT 1) AS x JOIN public.games g ON true")),
  ["public.games AS g"]
);

// Postgres folds unquoted identifiers to lower case, so `O.Amount` really
// means the column `amount` and comes back in a result column called
// `amount`. Storing what was typed produced a column map pointing at a
// column that does not exist, and a key that never matched.
const folded = detectEditableTargets({
  sql: "SELECT O.Amount, O.Id FROM Public.Orders O",
  tables: TABLES,
});
check(
  "an unquoted column resolves to how the table really spells it",
  folded[0].columns,
  [
    { result: "amount", column: "amount" },
    { result: "id", column: "id" },
  ]
);
check("and the key is found despite the casing", folded[0].pkResultColumn, "id");
check("an unquoted alias folds too", sourcesOf("SELECT o.id AS OrderId FROM t"), [
  "orderid<-o.id",
]);
check(
  "a quoted alias keeps its casing, because Postgres does",
  sourcesOf('SELECT o.id AS "OrderId" FROM t'),
  ["OrderId<-o.id"]
);
check(
  "a quoted column reference keeps its casing too",
  detectEditableTargets({
    sql: 'SELECT o."Amount" FROM public.orders o',
    tables: [
      {
        key: "public.orders",
        schema: "public",
        name: "orders",
        primaryKey: ["id"],
        columns: [{ name: "Amount" }, { name: "amount" }, { name: "id" }],
      },
    ],
  })[0].columns,
  [{ result: "Amount", column: "Amount" }]
);
check(
  "a table holding both Amount and amount is not resolved by coin flip",
  detectEditableTargets({
    sql: "SELECT o.AMOUNT FROM public.orders o",
    tables: [
      {
        key: "public.orders",
        schema: "public",
        name: "orders",
        primaryKey: ["id"],
        columns: [{ name: "Amount" }, { name: "amount" }, { name: "id" }],
      },
    ],
  }),
  []
);

// --- scoping a table picker to the query's own tables --------------------
const keysOf = (list) => list.map((table) => table.key);
check(
  "the tables a query reads from, in the order it names them",
  keysOf(
    resolveQueryTables({
      sql: "SELECT g.name FROM public.games g JOIN public.orders o ON o.game_id = g.id",
      tables: TABLES,
    })
  ),
  ["public.games", "public.orders"]
);
check(
  "a table joined twice is listed once",
  keysOf(
    resolveQueryTables({
      sql: "SELECT * FROM public.orders a JOIN public.orders b ON a.id = b.id",
      tables: TABLES,
    })
  ),
  ["public.orders"]
);
check(
  "no primary key is required, unlike the editable proposal",
  keysOf(resolveQueryTables({ sql: "SELECT a FROM public.notes", tables: TABLES })),
  ["public.notes"]
);
check(
  "an unqualified name two schemas answer to is left out rather than guessed",
  resolveQueryTables({ sql: "SELECT * FROM orders", tables: TABLES }),
  []
);
check(
  "a table the schema does not know is left out",
  resolveQueryTables({ sql: "SELECT * FROM nope.nope", tables: TABLES }),
  []
);
check(
  "a derived table narrows nothing but does not lose what is joined to it",
  keysOf(
    resolveQueryTables({
      sql: "SELECT * FROM (SELECT 1) x JOIN public.games g ON true",
      tables: TABLES,
    })
  ),
  ["public.games"]
);
check("nonsense in, nothing out", resolveQueryTables({ sql: "not sql", tables: TABLES }), []);
check("no schema, nothing out", resolveQueryTables({ sql: "SELECT * FROM public.games", tables: [] }), []);

// --- requiring a join to say where its columns come from -----------------
check(
  "a single-table query is asked for nothing",
  checkJoinQualification("SELECT id, name FROM public.games").needed,
  false
);
check(
  "a fully qualified join passes",
  checkJoinQualification(
    "SELECT b.col1, a.col2 FROM bbb AS b JOIN aaa AS a ON a.id = b.aaa_id"
  ).ok,
  true
);
check(
  "an alias written without AS is still an alias",
  checkJoinQualification("SELECT b.col1, a.col2 FROM bbb b JOIN aaa a ON a.id = b.id").ok,
  true
);
check(
  "a table with no alias is named",
  checkJoinQualification("SELECT b.col1 FROM bbb b JOIN aaa ON aaa.id = b.id").missingAlias,
  ["aaa"]
);
check(
  "a bare column in a join is named",
  checkJoinQualification("SELECT col1, a.col2 FROM bbb b JOIN aaa a ON a.id = b.id").unqualified,
  ["col1"]
);
check(
  "a bare * across a join is not waved through",
  checkJoinQualification("SELECT * FROM bbb b JOIN aaa a ON a.id = b.id").unqualified,
  ["*"]
);
check(
  "but a qualified star is fine",
  checkJoinQualification("SELECT b.* FROM bbb b JOIN aaa a ON a.id = b.id").ok,
  true
);
check(
  "an expression has no table to name, so it is exempt",
  checkJoinQualification(
    "SELECT count(*) AS total, b.col1 FROM bbb b JOIN aaa a ON a.id = b.id"
  ).ok,
  true
);
check(
  "a prefix that matches no table in the query is caught",
  checkJoinQualification("SELECT z.col1, b.col2 FROM bbb b JOIN aaa a ON a.id = b.id")
    .unknownQualifier,
  ["z.col1"]
);
check(
  "the alias is what counts, not the table name it replaced",
  checkJoinQualification("SELECT bbb.col1 FROM bbb b JOIN aaa a ON a.id = b.id").unknownQualifier,
  ["bbb.col1"]
);
check(
  "everything wrong at once is reported at once",
  (() => {
    const result = checkJoinQualification("SELECT col1, z.col2 FROM bbb JOIN aaa a ON a.id = 1");
    return [result.missingAlias, result.unqualified, result.unknownQualifier];
  })(),
  [["bbb"], ["col1"], ["z.col2"]]
);
check("empty sql asks for nothing", checkJoinQualification("").needed, false);

// --- two columns coming back under the same name -------------------------
// `a.id, b.id` returns two columns both called `id`. Everything that
// configures an edit addresses a column by name, so the two are one as far as
// the config is concerned -- and the one found first answers for both.
check(
  "a duplicated result name is called out",
  checkJoinQualification("SELECT a.id, b.id FROM aaa a JOIN bbb b ON b.aaa_id = a.id")
    .duplicateResults,
  ["id"]
);
check(
  "which is enough on its own to block the save",
  checkJoinQualification("SELECT a.id, b.id FROM aaa a JOIN bbb b ON b.aaa_id = a.id").ok,
  false
);
check(
  "an AS on one of them settles it",
  checkJoinQualification(
    "SELECT a.id AS a_id, b.id FROM aaa a JOIN bbb b ON b.aaa_id = a.id"
  ).ok,
  true
);
check(
  "and neither copy is attributed to a table while it is ambiguous",
  detectEditableTargets({
    sql: "SELECT o.id, g.id, o.amount FROM public.orders o JOIN public.games g ON o.game_id = g.id",
    tables: TABLES,
  }).map((target) => [target.key, target.columns.map((entry) => entry.result), target.pkResultColumn]),
  [["public.orders", ["amount"], ""]]
);
check(
  "once aliased apart, both tables come back with their own key",
  detectEditableTargets({
    sql: "SELECT o.id, g.id AS g_id, o.amount FROM public.orders o JOIN public.games g ON o.game_id = g.id",
    tables: TABLES,
  }).map((target) => [target.key, target.pkResultColumn]),
  [
    ["public.orders", "id"],
    ["public.games", "g_id"],
  ]
);
check(
  "a name a single-table query returns twice is dropped as well",
  detectEditableTargets({
    sql: "SELECT id, id, name FROM public.games",
    tables: TABLES,
  })[0].columns.map((entry) => entry.result),
  ["name"]
);
// Nothing is quietly repaired underneath an ambiguous query: with both `id`s
// dropped, the joined table accounts for no result column at all and is not
// offered. That is fine, because the duplicate blocks the save until it is
// aliased apart -- and once it is, the key completion has something to work
// with again.
check(
  "an ambiguous query is not silently completed",
  addMissingKeyColumns({
    sql: "SELECT o.id, g.id, o.amount FROM public.orders o JOIN public.games g ON o.game_id = g.id",
    tables: TABLES,
  }).added.some((entry) => entry.table === "public.games"),
  false
);
check(
  "but once aliased apart, the missing key is added as usual",
  addMissingKeyColumns({
    sql: "SELECT o.id AS o_id, g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id",
    tables: TABLES,
  }).added,
  [{ table: "public.games", column: "id", alias: "__key_g_id" }]
);

// --- completing a join so the joined table can be edited -----------------
const completed = addMissingKeyColumns({
  sql: "SELECT o.id, o.amount, g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id",
  tables: TABLES,
});
check(
  "the joined table's key is added under a machine name",
  completed.added,
  [{ table: "public.games", column: "id", alias: "__key_g_id" }]
);
check(
  "and lands at the end of the SELECT list, not inside the FROM",
  completed.sql,
  'SELECT o.id, o.amount, g.name, g."id" AS "__key_g_id"\nFROM public.orders o JOIN public.games g ON o.game_id = g.id'
);
check(
  "the rewritten query really does expose the key now",
  detectEditableTargets({ sql: completed.sql, tables: TABLES }).find(
    (target) => target.key === "public.games"
  ).pkResultColumn,
  "__key_g_id"
);
check(
  "a query that already has every key is left exactly as it was",
  addMissingKeyColumns({
    sql: "SELECT o.id, g.id AS gid, g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id",
    tables: TABLES,
  }).added,
  []
);
check(
  "a single-table query needs nothing added",
  addMissingKeyColumns({ sql: "SELECT id, name FROM public.games", tables: TABLES }).added,
  []
);

// Adding a column to any of these changes which rows come back, so it is
// refused rather than quietly altering what the query means.
for (const [label, sql] of [
  ["DISTINCT", "SELECT DISTINCT o.amount, g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id"],
  ["GROUP BY", "SELECT g.name, o.amount FROM public.orders o JOIN public.games g ON o.game_id = g.id GROUP BY g.name, o.amount"],
  ["UNION", "SELECT o.amount, g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id UNION SELECT 1, 'x'"],
]) {
  const attempt = addMissingKeyColumns({ sql, tables: TABLES });
  check(`${label} is refused rather than rewritten`, attempt.added, []);
  check(`${label} leaves the SQL untouched`, attempt.sql, sql);
  check(
    `${label} says which tables it gave up on`,
    attempt.refused.some((entry) => entry.table === "public.games"),
    true
  );
}
check(
  "a column named distinct_total is not mistaken for DISTINCT",
  addMissingKeyColumns({
    sql: "SELECT o.distinct_total, g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id",
    tables: TABLES,
  }).added.length,
  1
);
check(
  "a machine name that would collide gets numbered instead",
  addMissingKeyColumns({
    sql: 'SELECT o.id, o.amount AS "__key_g_id", g.name FROM public.orders o JOIN public.games g ON o.game_id = g.id',
    tables: TABLES,
  }).added,
  [{ table: "public.games", column: "id", alias: "__key_g_id_2" }]
);
check(
  "a table with a composite key is not completed, since one column cannot identify its row",
  addMissingKeyColumns({
    sql: "SELECT o.id, n.body FROM public.orders o JOIN public.notes n ON n.a = o.id",
    tables: TABLES,
  }).added,
  []
);
check("nothing to do on nonsense", addMissingKeyColumns({ sql: "nope", tables: TABLES }).added, []);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
