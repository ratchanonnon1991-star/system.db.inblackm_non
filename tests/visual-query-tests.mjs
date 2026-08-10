import assert from "node:assert/strict";
import { buildVisualLayout, buildVisualSelect } from "@/lib/gamedb-visual-query.js";
import { mapSchemaRows } from "@/server/gamedb-schema-inspector.js";

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

const layout = buildVisualLayout({
  baseLayout: { folder: "เกม", tableTone: "sky" },
  schema: "public",
  table: "games",
  primaryKey: "id",
  editableColumns: ["name", "name"],
});
check("visual layout preserves display settings", layout.folder, "เกม");
check("visual layout preserves table colour", layout.tableTone, "sky");
check("visual layout stores the qualified table", layout.editable.table, "public.games");
check("visual layout stores one primary key", layout.editable.pk, "id");
check("visual layout removes duplicate writable columns", layout.editable.columns, ["name"]);
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

console.log(`${passed} passed`);
