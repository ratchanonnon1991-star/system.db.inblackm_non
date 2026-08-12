// gamedb-edit-log.js: findEditById is what the row-restore route now trusts
// instead of a client-supplied values object (see the row/restore route) --
// worth its own regression coverage given what depends on it being right.
import { findEditById, recordEdit } from "@/server/gamedb-edit-log.js";
import { log, reset } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

reset();
await recordEdit({
  queryId: 7,
  actor: "admin",
  table: "packages",
  pkColumn: "id",
  pkValue: 42,
  column: "(ลบแถว)",
  oldValue: '{"id":42,"name":"a"}',
  newValue: null,
  ip: "1.2.3.4",
  userAgent: "curl",
});
const insert = log.find((entry) => /^\s*INSERT INTO gamedb_edit_log/i.test(entry.text));
ok("recordEdit writes an INSERT", Boolean(insert));
ok("recordEdit binds every value as a parameter", insert.params.length === 10);
ok("recordEdit never interpolates the table name into the SQL text", !insert.text.includes("packages"));

reset({
  rows: [
    {
      id: 9,
      query_id: 7,
      actor: "admin",
      table_name: "packages",
      pk_column: "id",
      pk_value: "42",
      column_name: "(ลบแถว)",
      old_value: '{"id":42,"name":"a"}',
      new_value: null,
      ip: "1.2.3.4",
      user_agent: "curl",
      created_at: "now",
    },
  ],
});
const entry = await findEditById(9);
ok("findEditById maps snake_case columns to camelCase", entry.queryId === 7 && entry.table === "packages");
ok("findEditById exposes the delete snapshot as oldValue", entry.oldValue === '{"id":42,"name":"a"}');
const lookup = log.find((e) => /WHERE id = \$1/i.test(e.text));
ok("the id is bound, not interpolated", Array.isArray(lookup.params) && lookup.params[0] === 9);

reset({ rows: [] });
ok("findEditById returns null for an id that does not exist", (await findEditById(999)) === null);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
