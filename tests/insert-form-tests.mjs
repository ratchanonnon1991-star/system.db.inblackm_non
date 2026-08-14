// The saved-INSERT form: what the guard lets through, what it refuses, and what
// actually reaches SQL when someone fills the form in.
import { runInsertForm, validateInsertSql } from "@/server/gamedb-insert-runner.js";
import { bindSqlParams, extractSqlParams } from "@/lib/gamedb-sql-params.js";
import { log, reset } from "@/lib/db.js";
import { setAllowWrite } from "@/server/gamedb-side-tables.js";
import {
  normalizeInsertForm,
  normalizeLayout,
  PARAM_TYPES,
  widgetForPgType,
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
const ok = (name, value) => check(name, Boolean(value), true);

function refuses(name, sql, fragment) {
  try {
    validateInsertSql(sql);
    failures.push(`${name}\n    expected a rejection, got none`);
  } catch (err) {
    if (fragment && !err.message.includes(fragment)) {
      failures.push(`${name}\n    message "${err.message}"`);
    } else pass += 1;
  }
}

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

// --- the guard -----------------------------------------------------------
ok(
  "a plain INSERT is accepted",
  validateInsertSql("INSERT INTO games (name) VALUES (:name)")
);
ok(
  "leading whitespace and case do not matter",
  validateInsertSql("  insert into games (name) values (:name)  ")
);
ok(
  "a trailing semicolon is trimmed rather than refused",
  validateInsertSql("INSERT INTO games (name) VALUES (:name);") ===
    "INSERT INTO games (name) VALUES (:name)"
);
ok(
  "INSERT ... SELECT is still an INSERT",
  validateInsertSql("INSERT INTO archive SELECT * FROM games WHERE id = :id")
);
ok(
  "ON CONFLICT DO UPDATE is the one place UPDATE belongs",
  validateInsertSql(
    "INSERT INTO games (id, name) VALUES (:id, :name) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name"
  )
);
ok(
  "RETURNING is allowed",
  validateInsertSql("INSERT INTO games (name) VALUES (:name) RETURNING id")
);

refuses("an empty script", "   ", "ยังไม่ได้บันทึก");
refuses("a SELECT", "SELECT * FROM games", "INSERT INTO");
refuses("an UPDATE", "UPDATE games SET name = :name", "INSERT INTO");
refuses("a DELETE", "DELETE FROM games WHERE id = :id", "INSERT INTO");
refuses(
  "a second statement after the insert",
  "INSERT INTO games (name) VALUES (:name); DROP TABLE games",
  "1 statement"
);
refuses(
  "a DROP smuggled into the tail",
  "INSERT INTO games (name) VALUES (:name) RETURNING (SELECT 1 FROM pg_sleep(10))",
  "ไม่อนุญาต"
);
refuses(
  "an UPDATE that is not attached to ON CONFLICT",
  "INSERT INTO games (name) SELECT name FROM (UPDATE x SET y = 1 RETURNING name) t",
  "ไม่อนุญาต"
);

// A semicolon or a keyword inside a literal is data, not a statement.
ok(
  "a semicolon inside a string literal is data",
  validateInsertSql("INSERT INTO notes (body) VALUES ('a; b')")
);
ok(
  "the word delete inside a literal is data",
  validateInsertSql("INSERT INTO notes (body) VALUES ('please delete later')")
);
ok(
  "a quoted identifier may contain anything",
  validateInsertSql('INSERT INTO games ("ชื่อเกม") VALUES (:name)')
);

// --- running it ----------------------------------------------------------
const FORM = normalizeInsertForm({
  sql: "INSERT INTO games (name, region) VALUES (:ชื่อ, :region)",
  label: "เพิ่มเกม",
  fields: [
    { name: "ชื่อ", label: "ชื่อเกม", required: true },
    { name: "region", label: "โซน", required: false },
  ],
});

setAllowWrite(true);
reset();
const result = await runInsertForm({
  insertForm: FORM,
  connection: null,
  values: { "ชื่อ": "Neverness", region: "GL" },
});
const insert = log.find((entry) => /^INSERT/i.test(entry.text));
check(
  "the statement is the saved one, with the placeholders replaced",
  insert.text,
  "INSERT INTO games (name, region) VALUES ($1, $2)"
);
ok("the values never appear in the SQL text", !insert.text.includes("Neverness"));
ok("they arrive as bound parameters instead", insert.params.includes("Neverness"));
check("both fields are bound", insert.params, ["Neverness", "GL"]);
ok("the placeholders became $n", insert.text.includes("$1") && insert.text.includes("$2"));
ok("it ran inside a transaction", log.some((entry) => entry.text === "BEGIN"));
ok("and was committed", log.some((entry) => entry.text === "COMMIT"));
ok(
  "with a statement timeout",
  log.some((entry) => /SET LOCAL statement_timeout/.test(entry.text))
);
check("the row count comes back", result.rowCount >= 0, true);

// A quoted value cannot break out, because it is never in the text.
reset();
await runInsertForm({
  insertForm: FORM,
  connection: null,
  values: { "ชื่อ": "'); DROP TABLE games; --", region: "GL" },
});
const attack = log.find((entry) => /^INSERT/i.test(entry.text));
ok("an injection attempt stays a value", !attack.text.includes("DROP"));
check("and is bound verbatim", attack.params[0], "'); DROP TABLE games; --");

// --- what it refuses to run ----------------------------------------------
await rejects(
  "a required field left blank",
  runInsertForm({ insertForm: FORM, connection: null, values: { region: "GL" } }),
  { status: 400, fragment: "ชื่อเกม" }
);

reset();
await runInsertForm({
  insertForm: FORM,
  connection: null,
  values: { "ชื่อ": "Neverness" },
});
const optional = log.find((entry) => /^INSERT/i.test(entry.text));
check("an optional field left blank binds as NULL", optional.params, ["Neverness", null]);

await rejects(
  "a query with no form saved",
  runInsertForm({ insertForm: null, connection: null, values: {} }),
  { status: 400, fragment: "ยังไม่ได้ตั้งค่า" }
);

await rejects(
  "a script that is not an INSERT, even though it was saved",
  runInsertForm({
    insertForm: { sql: "DELETE FROM games", fields: [] },
    connection: null,
    values: {},
  }),
  { status: 400, fragment: "INSERT INTO" }
);

setAllowWrite(false);
await rejects(
  "a connection that is not opted in to writing",
  runInsertForm({ insertForm: FORM, connection: null, values: { "ชื่อ": "x", region: "y" } }),
  { status: 403, fragment: "ยังไม่ได้เปิดให้เขียน" }
);
setAllowWrite(true);

// --- the layout shape ----------------------------------------------------
check("a form with no sql is nothing at all", normalizeInsertForm({ fields: [] }), null);
check("a non-object is nothing at all", normalizeInsertForm("INSERT"), null);
check(
  "required defaults to true, like the parameter fields",
  normalizeInsertForm({ sql: "INSERT INTO t (a) VALUES (:a)", fields: [{ name: "a" }] }).fields[0]
    .required,
  true
);
check(
  "an unknown type falls back to text",
  normalizeInsertForm({
    sql: "INSERT INTO t (a) VALUES (:a)",
    fields: [{ name: "a", type: "sql" }],
  }).fields[0].type,
  "text"
);
check(
  "fields without a name are dropped",
  normalizeInsertForm({
    sql: "INSERT INTO t (a) VALUES (:a)",
    fields: [{ label: "no name" }, { name: "a" }],
  }).fields.length,
  1
);

// --- Thai placeholder names ----------------------------------------------
// The scanner takes letters from any script now, which is what makes a form
// like :ชื่อเกม work at all. The things it has always skipped must keep being
// skipped: a Thai name is no reason to start rewriting casts or literals.
check(
  "a Thai placeholder is found",
  extractSqlParams("INSERT INTO games (name) VALUES (:ชื่อเกม)"),
  ["ชื่อเกม"]
);
check(
  "Thai and ASCII names side by side",
  extractSqlParams("INSERT INTO t (a, b) VALUES (:ชื่อ, :region)"),
  ["ชื่อ", "region"]
);
check(
  "a name may mix scripts and digits",
  extractSqlParams("INSERT INTO t (a) VALUES (:เกม2)"),
  ["เกม2"]
);
check(
  "a cast is not a placeholder",
  extractSqlParams("SELECT id::text FROM t WHERE name = :ชื่อ"),
  ["ชื่อ"]
);
check(
  "a colon inside a literal is not a placeholder",
  extractSqlParams("INSERT INTO t (a) VALUES ('เวลา :ชื่อ')"),
  []
);
check(
  "nor is one inside a quoted identifier",
  extractSqlParams('SELECT "a:ชื่อ" FROM t'),
  []
);
check(
  "the same name twice binds one parameter",
  bindSqlParams("INSERT INTO t (a, b) VALUES (:ชื่อ, :ชื่อ)", { "ชื่อ": "x" }).values,
  ["x"]
);

// The three places a layout key has to exist, or it is silently dropped on save.
const roundTrip = sanitizeLayout({
  insertForm: { sql: "INSERT INTO t (a) VALUES (:a)", fields: [{ name: "a", label: "A" }] },
});
ok("sanitizeLayout keeps the form", Boolean(roundTrip.insertForm));
check("with its fields", roundTrip.insertForm.fields[0].label, "A");
check(
  "normalizeLayout keeps it too",
  normalizeLayout(roundTrip).insertForm.sql,
  "INSERT INTO t (a) VALUES (:a)"
);
check("and a layout without one reads as null", normalizeLayout({}).insertForm, null);
check(
  "a script over the cap is cut rather than stored whole",
  normalizeInsertForm({ sql: `INSERT INTO t (a) VALUES ('${"x".repeat(6000)}')` }).sql.length,
  5000
);

// --- the field type a new form field starts as ---------------------------
// InsertFormModal seeds each field's type from the real column type via
// widgetForPgType. That only works while every value it can return is also a
// valid field type -- otherwise normalizeInsertForm silently rewrites it back
// to "text" and the form quietly goes back to being all text boxes.
const PG_TYPES = [
  "boolean",
  "integer",
  "smallint",
  "bigint",
  "numeric(12,2)",
  "real",
  "double precision",
  "money",
  "date",
  "time without time zone",
  "timestamp without time zone",
  "timestamp with time zone",
  "character varying(255)",
  "text",
  "uuid",
  "jsonb",
  "",
];
for (const pgType of PG_TYPES) {
  const guessed = widgetForPgType(pgType);
  ok(`"${pgType || "(unknown)"}" seeds a field type the form can keep`, PARAM_TYPES.includes(guessed));
  check(
    `...and survives normalizeInsertForm as "${guessed}"`,
    normalizeInsertForm({
      sql: "INSERT INTO t (a) VALUES (:a)",
      fields: [{ name: "a", type: guessed }],
    }).fields[0].type,
    guessed
  );
}
check("a date column seeds a date picker, not a text box", widgetForPgType("date"), "date");
check("a boolean column seeds a switch", widgetForPgType("boolean"), "boolean");
check("a numeric column seeds a number box", widgetForPgType("numeric(12,2)"), "number");

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
