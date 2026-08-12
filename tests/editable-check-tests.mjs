import { buildUpdateSql, checkEditable } from "@/server/gamedb-editable-check.js";
import { log, reset, setResponder } from "@/lib/db.js";
import { setAllowWrite } from "@/server/gamedb-side-tables.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

// ---------------------------------------------------------------- buildUpdateSql

const aliased = {
  table: "topup.topup_entry",
  pk: "ID",
  pkColumn: "id",
  columns: ["Rank", "หมายเหตุ"],
  columnMap: { Rank: "rank", "หมายเหตุ": "note" },
};

let sql = buildUpdateSql(aliased, "Rank");
ok("sql: quotes the schema and table separately",
  sql.update.includes('"topup"."topup_entry"'));
ok("sql: maps the alias to the real column",
  sql.update.includes('SET "rank" = $1'));
ok("sql: uses pkColumn, not the result name",
  sql.update.includes('WHERE "id" = $2'));
ok("sql: never mentions the alias itself", !sql.update.includes('"Rank"') && !sql.update.includes('"ID"'));
ok("sql: returns the written column", sql.update.includes('RETURNING "rank" AS value'));
ok("sql: locks the row first",
  sql.lock === 'SELECT "rank" AS value FROM "topup"."topup_entry" WHERE "id" = $1 FOR UPDATE');
ok("sql: reports both names", sql.column === "Rank" && sql.realColumn === "rank");

sql = buildUpdateSql(aliased, "หมายเหตุ");
ok("sql: Thai alias maps too", sql.update.includes('SET "note" = $1'));

const plain = { table: "packages", pk: "id", pkColumn: "", columns: ["price"], columnMap: {} };
sql = buildUpdateSql(plain, "price");
ok("sql: unqualified table", sql.update.startsWith('UPDATE "packages" SET "price" = $1'));
ok("sql: pk falls back to the result name when unmapped",
  sql.update.includes('WHERE "id" = $2'));

let threw = false;
try {
  buildUpdateSql({ ...plain, table: 'pack"ages' }, "price");
} catch {
  threw = true;
}
ok("sql: refuses a table name that could break out of the quotes", threw);

// ------------------------------------------------------------------ checkEditable

// A catalog that knows one table with four columns and a unique index on id.
const catalog = (text, params) => {
  if (text.includes("pg_class c") && text.includes("relkind")) {
    return params[0] === "topup_entry"
      ? { rows: [{ table: "topup_entry", schema: params[1] || "topup" }] }
      : { rows: [] };
  }
  if (text.includes("pg_attribute a") && text.includes("format_type")) {
    return {
      rows: [
        { name: "id", type: "integer", not_null: true, has_default: true },
        { name: "rank", type: "integer", not_null: false, has_default: false },
        { name: "note", type: "text", not_null: false, has_default: false },
        { name: "game_id", type: "integer", not_null: true, has_default: false },
      ],
    };
  }
  if (text.includes("indisunique")) {
    return { rows: params[2] === "id" ? [{ "?column?": 1 }] : [] };
  }
  if (text.includes("attname = ANY")) {
    return params[0] === "game"
      ? { rows: [{ name: "id" }, { name: "name" }] }
      : { rows: [] };
  }
  return null;
};

const labels = (checks) => checks.map((check) => `${check.ok ? "+" : "-"}${check.label}`);
const failing = (checks) => checks.filter((check) => !check.ok);

reset();
setAllowWrite(true);
setResponder(catalog);
let out = await checkEditable({ editable: aliased, connection: null });
ok("check: all pass on a sound config", out.checks.every((c) => c.ok));
ok("check: reports the write flag", labels(out.checks)[0] === "+ฐานข้อมูลเปิดให้เขียน");
ok("check: resolves the table", out.checks.some((c) => c.ok && c.detail === "topup.topup_entry"));
ok("check: reports the key type",
  out.checks.some((c) => c.label.includes('คอลัมน์ key "id"') && c.detail === "integer"));
ok("check: notices the unique index", out.checks.some((c) => c.ok && c.label.includes("unique index")));
ok("check: lists the writable columns with their types",
  out.checks.some((c) => c.detail.includes("Rank → rank (integer)") && c.detail.includes("หมายเหตุ → note (text)")));
ok("check: returns one statement pair per column", out.sql.length === 2);
ok("check: nothing was written",
  !log.some((entry) => /^\s*(UPDATE|INSERT|DELETE)/i.test(entry.text)));
ok("check: every probe bound its parameters",
  log.filter((e) => /SELECT/i.test(e.text)).every((e) => Array.isArray(e.params)));
// Every catalog *probe* -- the ones asking pg_class/pg_attribute/pg_index
// "does this exist" -- searches by name via a bound parameter, so none of
// them should ever embed the resolved table name as literal text. The one
// exception is the sample-row preview: that is a real `SELECT ... FROM
// "topup"."topup_entry"` against the table itself, and a FROM target cannot
// be a bound parameter -- same reasoning buildUpdateSql already relies on,
// just quoted instead of interpolated. Excluded here by name deliberately,
// not because the rule stopped mattering.
const catalogProbes = log.filter(
  (e) => /SELECT/i.test(e.text) && !e.text.includes('FROM "topup"."topup_entry"')
);
ok("check: no catalog probe interpolated the table name",
  !catalogProbes.some((e) => e.text.includes("topup_entry")));
ok("check: the sample preview reads from the table by its quoted identifier",
  log.some((e) => e.text.includes('FROM "topup"."topup_entry"')));
ok("check: sample preview selects the key plus writable columns",
  out.sample.columns.join(",") === "id,rank,note");
ok("check: sample preview shape survives an empty table", Array.isArray(out.sample.rows));

// A read-only connection is reported, and the rest still runs
reset();
setAllowWrite(false);
setResponder(catalog);
out = await checkEditable({ editable: aliased, connection: { id: 3, name: "topup_inblackm" } });
ok("write off: flagged", failing(out.checks).some((c) => c.label.includes("ยังไม่เปิดให้เขียน")));
ok("write off: names the database", failing(out.checks)[0].detail.includes("topup_inblackm"));
ok("write off: the other checks still ran", out.checks.length > 3);
ok("write off: statements are still shown", out.sql.length === 2);

// Missing table stops there rather than guessing
reset();
setAllowWrite(true);
setResponder(catalog);
out = await checkEditable({
  editable: { ...aliased, table: "no_such_table" },
  connection: null,
});
ok("no table: flagged", failing(out.checks).some((c) => c.label === "ไม่พบตารางนี้"));
ok("no table: suggests a schema", failing(out.checks).some((c) => c.detail.includes("public.no_such_table")));
ok("no table: no statements offered", out.sql.length === 0);

// A pk that is not a real column, which is the aliased-query trap
reset();
setAllowWrite(true);
setResponder(catalog);
out = await checkEditable({
  editable: { ...aliased, pkColumn: "", pk: "ID" },
  connection: null,
});
ok("bad pk: flagged", failing(out.checks).some((c) => c.label.includes('ไม่พบคอลัมน์ key "ID"')));
ok("bad pk: lists what the table does have",
  failing(out.checks).some((c) => c.detail.includes("id, rank, note, game_id")));
ok("bad pk: skips the unique check it cannot do",
  !out.checks.some((c) => c.label.includes("unique index")));

// A column that came from a JOIN and has nowhere to be written back to
reset();
setAllowWrite(true);
setResponder(catalog);
out = await checkEditable({
  editable: { ...aliased, columns: ["Rank", "GAME"], columnMap: { Rank: "rank" } },
  connection: null,
});
ok("joined column: flagged", failing(out.checks).some((c) => c.label.includes("ไม่พบในตาราง 1 คอลัมน์")));
ok("joined column: named", failing(out.checks).some((c) => c.detail.startsWith("GAME")));

// No unique index on the key
reset();
setAllowWrite(true);
setResponder((text, params) =>
  text.includes("indisunique") ? { rows: [] } : catalog(text, params)
);
out = await checkEditable({ editable: aliased, connection: null });
ok("no unique index: flagged", failing(out.checks).some((c) => c.label.includes("ไม่มี unique index")));
ok("no unique index: explains the consequence",
  failing(out.checks).some((c) => c.detail.includes("มากกว่า 1 แถว")));

// Lookups are checked against their own table
reset();
setAllowWrite(true);
setResponder(catalog);
out = await checkEditable({
  editable: {
    ...aliased,
    columns: ["Rank"],
    columnMap: { Rank: "rank" },
    inputs: [
      {
        column: "Rank",
        widget: "lookup",
        lookup: { table: "game", valueColumn: "id", labelColumn: "name" },
      },
    ],
  },
  connection: null,
});
ok("lookup ok: reported", out.checks.some((c) => c.ok && c.label.includes('ตัวเลือกของ "Rank"')));
ok("lookup ok: says which column shows and which is stored",
  out.checks.some((c) => c.detail.includes("แสดง name เก็บ id")));

reset();
setAllowWrite(true);
setResponder(catalog);
out = await checkEditable({
  editable: {
    ...aliased,
    columns: ["Rank"],
    columnMap: { Rank: "rank" },
    inputs: [
      {
        column: "Rank",
        widget: "lookup",
        lookup: { table: "nope", valueColumn: "id", labelColumn: "name" },
      },
    ],
  },
  connection: null,
});
ok("lookup broken: flagged", failing(out.checks).some((c) => c.label.includes("ใช้ไม่ได้")));
ok("lookup broken: names the missing columns",
  failing(out.checks).some((c) => c.detail.includes("id, name")));

// A database that will not answer at all
reset({ fail: "connection terminated" });
setAllowWrite(true);
out = await checkEditable({ editable: aliased, connection: null });
ok("db error: reported, not thrown", failing(out.checks).some((c) => c.label === "ตรวจสอบไม่สำเร็จ"));
ok("db error: no statements offered", out.sql.length === 0);
ok("db error: the client was released", log.some((entry) => entry.text === "RELEASE"));

console.log(`${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
