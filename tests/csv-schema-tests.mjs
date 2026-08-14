// Guessing a table's columns from a spreadsheet someone already has.
import {
  guessColumnType,
  guessColumnsFromCsv,
  toColumnName,
} from "@/lib/gamedb-csv-schema.js";
import { parseCsv } from "@/lib/gameinfo-csv.js";
import { buildCreateTableSql } from "@/lib/gamedb-schema-ddl.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

// --- column names --------------------------------------------------------
check("a plain header is kept", toColumnName("order_id"), "order_id");
check("a Thai header is kept -- Thai identifiers are normal here", toColumnName("ชื่อเกม"), "ชื่อเกม");
check("surrounding whitespace goes", toColumnName("  ยอดเงิน  "), "ยอดเงิน");
check("inner whitespace collapses", toColumnName("ยอด\t\tเงิน"), "ยอด เงิน");
check("a quote cannot survive into a quoted identifier", toColumnName('a"b'), "a b");
check("an empty header still yields a usable name", toColumnName("", 0), "column_1");
check("a header of only unusable characters falls back too", toColumnName("()/.", 3), "column_4");
check("a very long header is cut to the identifier limit", toColumnName("ก".repeat(100)).length, 63);

// Whatever comes out has to actually survive the DDL builder, or the import
// would propose a table that cannot be created.
const oddHeaders = parseCsv('a"b,,()/.\nx,y,z\n');
const oddColumns = guessColumnsFromCsv(oddHeaders);
check(
  "every guessed name is accepted by the CREATE TABLE builder",
  typeof buildCreateTableSql({ table: "public.t", columns: oddColumns }),
  "string"
);

// --- types ---------------------------------------------------------------
check("whole numbers", guessColumnType(["1", "2", "300"]), "integer");
check("past 2^31 it has to be bigint", guessColumnType(["1", "9999999999"]), "bigint");
check("decimals", guessColumnType(["1.5", "2.25"]), "numeric");
check("thousands separators are normal in an export", guessColumnType(["1,234", "5,678"]), "numeric");
check("iso dates", guessColumnType(["2026-01-31", "2026-02-01"]), "date");
check("d/m/y dates", guessColumnType(["31/01/2026"]), "date");
check("timestamps", guessColumnType(["2026-01-31 10:00:00", "2026-02-01T11:30"]), "timestamptz");
check("booleans", guessColumnType(["true", "false"]), "boolean");
check("Thai yes/no counts as boolean", guessColumnType(["ใช่", "ไม่ใช่"]), "boolean");
check("short text", guessColumnType(["IDENTITY V", "ROV"]), "varchar255");
check("long text needs an unbounded column", guessColumnType(["x".repeat(300)]), "text");
check("an all-blank column cannot be guessed, so text", guessColumnType(["", "  "]), "text");
check("no values at all is text", guessColumnType([]), "text");
check(
  "blanks are ignored rather than forcing text on an otherwise clean column",
  guessColumnType(["1", "", "3"]),
  "integer"
);
check(
  "one bad value is enough to fall back",
  guessColumnType(["1", "2", "ไม่ทราบ"]),
  "varchar255"
);

// --- the whole proposal --------------------------------------------------
const parsed = parseCsv(
  "order_id,game,paid,created_at\n1,ROV,true,2026-01-31\n2,IDV,false,2026-02-01\n"
);
const guessed = guessColumnsFromCsv(parsed);
check(
  "each column gets a name and a type",
  guessed.map((column) => [column.name, column.type]),
  [
    ["order_id", "integer"],
    ["game", "varchar255"],
    ["paid", "boolean"],
    ["created_at", "date"],
  ]
);
check("a column with no gaps is proposed as required", guessed[0].notNull, true);

const withGap = guessColumnsFromCsv(parseCsv("a,b\n1,x\n2,\n"));
check("a column with a gap is not proposed as required", withGap[1].notNull, false);
check("...but the one without gaps still is", withGap[0].notNull, true);

// Two headers that clean up to the same identifier would be rejected by
// CREATE TABLE, so the later one is numbered instead.
const collided = guessColumnsFromCsv(parseCsv("ชื่อ,ชื่อ \n1,2\n"));
check("colliding headers are made unique", collided.map((c) => c.name), ["ชื่อ", "ชื่อ 2"]);
check(
  "and the deduped list builds",
  typeof buildCreateTableSql({ table: "public.t", columns: collided }),
  "string"
);

check("an empty file proposes nothing", guessColumnsFromCsv({ headers: [], rows: [] }), []);
check(
  "headers with no data rows still propose columns",
  guessColumnsFromCsv(parseCsv("a,b\n")).map((c) => [c.name, c.type, c.notNull]),
  [
    ["a", "text", false],
    ["b", "text", false],
  ]
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
