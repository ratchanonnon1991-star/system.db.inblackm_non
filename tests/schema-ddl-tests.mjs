// gamedb-schema-ddl.js: the only two statements /createdb is allowed to
// build. Type comes from a fixed allowlist reaching SQL as literal text with
// no quoting -- exactly the thing worth pinning down here.
import { buildAddColumnSql, buildCreateTableSql, DDL_COLUMN_TYPES } from "@/lib/gamedb-schema-ddl.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
function throws(name, fn, fragment) {
  try {
    fn();
    failures.push(`${name}\n    expected a throw, got none`);
  } catch (err) {
    if (fragment && !err.message.includes(fragment)) {
      failures.push(`${name}\n    message "${err.message}" missing "${fragment}"`);
    } else pass += 1;
  }
}

// --- buildCreateTableSql -----------------------------------------------------
check(
  "builds a quoted CREATE TABLE with each column's real type",
  buildCreateTableSql({
    table: "public.packages",
    columns: [
      { name: "id", type: "integer", notNull: true },
      { name: "note", type: "text", notNull: false },
    ],
  }),
  'CREATE TABLE "public"."packages" (\n  "id" INTEGER NOT NULL,\n  "note" TEXT\n)'
);
check(
  "a primary key column adds a PRIMARY KEY clause",
  buildCreateTableSql({
    table: "packages",
    columns: [{ name: "id", type: "integer", notNull: true }],
    primaryKeyColumn: "id",
  }),
  'CREATE TABLE "packages" (\n  "id" INTEGER NOT NULL,\n  PRIMARY KEY ("id")\n)'
);
throws("refuses a table name that could break out of the quotes", () =>
  buildCreateTableSql({ table: 'pack"ages', columns: [{ name: "id", type: "integer" }] })
);
throws("refuses with no columns", () => buildCreateTableSql({ table: "t", columns: [] }));
throws("refuses a column name that could break out of the quotes", () =>
  buildCreateTableSql({ table: "t", columns: [{ name: 'x"y', type: "text" }] })
);
throws("refuses an unknown type", () =>
  buildCreateTableSql({ table: "t", columns: [{ name: "x", type: "drop table users" }] })
);
throws("refuses a duplicate column name", () =>
  buildCreateTableSql({
    table: "t",
    columns: [
      { name: "x", type: "text" },
      { name: "x", type: "integer" },
    ],
  })
);
throws("refuses a primary key column not in the list", () =>
  buildCreateTableSql({ table: "t", columns: [{ name: "x", type: "text" }], primaryKeyColumn: "y" })
);
{
  const many = Array.from({ length: 50 }, (_, i) => ({ name: `c${i}`, type: "text" }));
  const columnCount = (buildCreateTableSql({ table: "t", columns: many }).match(/"c\d+"/g) || []).length;
  check("caps the column list at 40", columnCount, 40);
}

// --- buildAddColumnSql --------------------------------------------------------
check(
  "builds a quoted ALTER TABLE ADD COLUMN",
  buildAddColumnSql({ table: "public.packages", column: "note", type: "text" }),
  'ALTER TABLE "public"."packages" ADD COLUMN "note" TEXT'
);
check("never adds NOT NULL -- always nullable", buildAddColumnSql({ table: "t", column: "x", type: "boolean" }).includes("NOT NULL"), false);
throws("refuses a table name that could break out of the quotes", () =>
  buildAddColumnSql({ table: 't"; DROP TABLE users; --', column: "x", type: "text" })
);
throws("refuses a column name that could break out of the quotes", () =>
  buildAddColumnSql({ table: "t", column: 'x"y', type: "text" })
);
throws("refuses an unknown type, closing off free-text SQL injection via the type field", () =>
  buildAddColumnSql({ table: "t", column: "x", type: "text; DROP TABLE users; --" })
);

// --- DDL_COLUMN_TYPES ----------------------------------------------------------
check("every listed type maps to real, distinct SQL", new Set(DDL_COLUMN_TYPES.map((t) => t.sql)).size, DDL_COLUMN_TYPES.length);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}
