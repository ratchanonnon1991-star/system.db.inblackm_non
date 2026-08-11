import assert from "node:assert/strict";
import { buildVisualLayout, buildVisualSelect } from "@/lib/gamedb-visual-query.js";
import { mapForeignKeyRows, mapSchemaRows } from "@/server/gamedb-schema-inspector.js";

let passed = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
}

check(
  "visual builder quotes every identifier",
  buildVisualSelect({ schema: "public", table: "game list", columns: ["id", "ชื่อเกม"] }),
  'SELECT\n  "id",\n  "ชื่อเกม"\nFROM "public"."game list"'
);
check(
  "visual builder removes duplicate columns",
  buildVisualSelect({ schema: "public", table: "games", columns: ["id", "id"] }),
  'SELECT\n  "id"\nFROM "public"."games"'
);
check(
  "an empty visual selection cannot produce SQL",
  buildVisualSelect({ schema: "public", table: "games", columns: [] }),
  ""
);
check(
  "filters sorting and limit are generated without raw identifiers",
  buildVisualSelect({
    schema: "public",
    table: "games",
    columns: ["id", "name"],
    filters: [
      { column: "name", op: "contains", value: "King's" },
      { column: "id", op: "gte", value: "10", kind: "number" },
    ],
    sort: { column: "name", direction: "desc" },
    limit: 50,
  }),
  'SELECT\n  "id",\n  "name"\nFROM "public"."games"\nWHERE\n  CAST("name" AS text) ILIKE E\'%King\'\'s%\'\n  AND "id" >= 10\nORDER BY "name" DESC\nLIMIT 50'
);
check(
  "text filter escapes quotes and backslashes",
  buildVisualSelect({
    schema: "public", table: "games", columns: ["id"],
    filters: [{ column: "name", op: "eq", value: "x\\' OR TRUE --" }],
  }).includes("E'x\\\\'' OR TRUE --'"),
  true
);
check(
  "limit is capped at the query runner maximum",
  buildVisualSelect({ schema: "public", table: "games", columns: ["id"], limit: 99999 }).endsWith("LIMIT 1000"),
  true
);
check(
  "foreign-key joins qualify base columns and alias joined results",
  buildVisualSelect({
    schema: "public",
    table: "orders",
    columns: ["id", "game_id"],
    joins: [{
      schema: "public",
      table: "games",
      pairs: [{ baseColumn: "game_id", joinColumn: "id" }],
      columns: [{ name: "name", alias: "j1_name" }],
    }],
    sort: { column: "id", direction: "desc" },
    limit: 100,
  }),
  'SELECT\n  "t0"."id",\n  "t0"."game_id",\n  "t1"."name" AS "j1_name"\nFROM "public"."orders" AS "t0"\nLEFT JOIN "public"."games" AS "t1" ON "t0"."game_id" = "t1"."id"\nORDER BY "t0"."id" DESC\nLIMIT 100'
);
assert.throws(
  () => buildVisualSelect({
    schema: "public", table: "orders", columns: ["id"],
    joins: [{
      schema: "public", table: 'games"; DROP TABLE users; --',
      pairs: [{ baseColumn: "game_id", joinColumn: "id" }],
      columns: [{ name: "name", alias: "game_name" }],
    }],
  }),
  /ชื่อตาราง\/คอลัมน์ไม่ถูกต้อง/
);
passed += 1;
assert.throws(
  () => buildVisualSelect({
    schema: "public", table: "games", columns: ["id"],
    filters: [{ column: "id", op: "eq", value: "1 OR 1=1", kind: "number" }],
  }),
  /ค่าตัวเลขไม่ถูกต้อง/
);
passed += 1;
assert.throws(
  () => buildVisualSelect({
    schema: "public", table: "games", columns: ["id"],
    filters: [{ column: "name", op: "contains", value: "" }],
  }),
  /กรุณาใส่ค่าตัวกรอง/
);
passed += 1;

const layout = buildVisualLayout({
  baseLayout: { folder: "เกม", tableTone: "sky" },
  schema: "public",
  table: "games",
  primaryKey: "id",
  editableColumns: ["name", "name"],
  selectedColumns: ["id", "name"],
  tableTone: "sky",
  columnSettings: {
    name: { label: "ชื่อเกม", render: "chip", bg: "amber", headerBg: "yellow", align: "left" },
  },
});
check("visual layout preserves display settings", layout.folder, "เกม");
check("visual layout preserves table colour", layout.tableTone, "sky");
check("visual layout stores the qualified table", layout.editable.table, "public.games");
check("visual layout stores one primary key", layout.editable.pk, "id");
check("visual layout removes duplicate writable columns", layout.editable.columns, ["name"]);
check("visual layout stores a friendly column label", layout.labels.c1, "ชื่อเกม");
check("visual layout stores the selected renderer", layout.formats.c1.render, "chip");
check("visual layout stores the selected cell colour", layout.formats.c1.bg, "amber");
const joinedLayout = buildVisualLayout({
  selectedColumns: ["id", "j1_c1_name"],
  columnSettings: { j1_c1_name: { label: "games.name" } },
});
check("joined result label is stored at its result position", joinedLayout.labels.c1, "games.name");
check(
  "no writable column leaves the query read-only",
  buildVisualLayout({ schema: "public", table: "games", primaryKey: "id", editableColumns: [] }).editable,
  null
);

const rows = [
  {
    schema_name: "public", table_name: "games", column_name: "id", data_type: "integer",
    nullable: false, identity_column: true, generated_column: false, can_select: true,
    can_update: true, primary_key_position: 1,
  },
  {
    schema_name: "public", table_name: "games", column_name: "name", data_type: "text",
    nullable: true, identity_column: false, generated_column: false, can_select: true,
    can_update: true, primary_key_position: 0,
  },
];
let tables = mapSchemaRows(rows, true);
check("schema rows are grouped by table", tables.length, 1);
check("primary key order is preserved", tables[0].primaryKey, ["id"]);
check("primary key is shown as read-only", tables[0].columns[0].editable, false);
check("ordinary updateable column is editable", tables[0].columns[1].editable, true);

tables = mapSchemaRows(rows, false);
check("app read-only flag overrides database UPDATE privilege", tables[0].columns[1].editable, false);
check(
  "read-only reason is explicit",
  tables[0].columns[1].editReason,
  "ฐานข้อมูลนี้เปิดโหมดอ่านอย่างเดียว"
);

const relationships = mapForeignKeyRows([
  {
    constraint_id: "42", constraint_name: "orders_game_id_fkey",
    source_schema: "public", source_table: "orders", source_column: "game_id",
    target_schema: "public", target_table: "games", target_column: "id", position: 1,
  },
  {
    constraint_id: "43", constraint_name: "composite_fkey",
    source_schema: "public", source_table: "packs", source_column: "game_id",
    target_schema: "public", target_table: "games", target_column: "id", position: 1,
  },
  {
    constraint_id: "43", constraint_name: "composite_fkey",
    source_schema: "public", source_table: "packs", source_column: "region",
    target_schema: "public", target_table: "games", target_column: "region", position: 2,
  },
]);
check("foreign keys are grouped by constraint", relationships.length, 2);
check("foreign key table names include schema", relationships[0].fromTable, "public.orders");
check("composite foreign key keeps every pair", relationships[1].pairs.length, 2);

console.log(`${passed} passed`);
