// gamedb-cell-notes.js: notes are pure annotation data, never used to build
// SQL, so the only thing worth pinning down here is the plumbing -- upsert
// vs delete-on-blank, and that every value travels bound.
import { listNotes, upsertNote } from "@/server/gamedb-cell-notes.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

// --- upsertNote: a real note -------------------------------------------------
reset();
// The generic INSERT stub answers a fixed {pk: 99} row, which does not have
// this table's columns -- a responder is needed to answer with a row shaped
// like what upsertNote actually asks for back.
setResponder((text) =>
  /^\s*INSERT INTO gamedb_cell_notes/i.test(text)
    ? {
        rows: [
          {
            pk_value: "42",
            column_name: "status",
            note: "double-check this one",
            author: "admin",
            updated_at: "now",
          },
        ],
      }
    : null
);
const saved = await upsertNote({ queryId: 7, pkValue: 42, column: "status", note: "  double-check this one  ", author: "admin" });
const insert = log.find((entry) => /^\s*INSERT INTO gamedb_cell_notes/i.test(entry.text));
ok("a non-blank note issues an upsert INSERT ... ON CONFLICT", Boolean(insert));
ok("every value travels as a bound parameter", Array.isArray(insert.params) && insert.params.length === 5);
ok("the pk value is coerced to a string before binding", insert.params[1] === "42");
ok("upsertNote returns the saved shape", saved.note === "double-check this one");
ok("no note text is ever interpolated into the SQL text",
  !insert.text.includes("double-check"));

// --- upsertNote: a blank note deletes instead --------------------------------
reset();
const cleared = await upsertNote({ queryId: 7, pkValue: 42, column: "status", note: "   ", author: "admin" });
const del = log.find((entry) => /^\s*DELETE FROM gamedb_cell_notes/i.test(entry.text));
ok("a blank note deletes rather than storing an empty string", Boolean(del));
ok("no INSERT is issued for a blank note",
  !log.some((entry) => /^\s*INSERT/i.test(entry.text)));
ok("upsertNote returns null after a delete", cleared === null);

// --- listNotes ----------------------------------------------------------------
reset({
  rows: [
    { pk_value: "1", column_name: "note", note: "a", author: "x", updated_at: "now" },
    { pk_value: "2", column_name: "status", note: "b", author: "y", updated_at: "now" },
  ],
});
const notes = await listNotes(7);
ok("listNotes maps snake_case columns to camelCase", notes[0].pkValue === "1" && notes[1].column === "status");
const select = log.find((entry) => /^\s*SELECT/i.test(entry.text));
ok("listNotes scopes by query_id, bound not interpolated", select.params[0] === 7);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
