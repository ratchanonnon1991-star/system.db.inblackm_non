// gamedb-filter-views-repository.js: saved filter presets are plain data
// (search text, a lookup toggle, param values), never used to build SQL --
// the only thing worth pinning down is the plumbing.
import {
  deleteFilterView,
  insertFilterView,
  listFilterViews,
} from "@/server/gamedb-filter-views-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

// --- insertFilterView --------------------------------------------------------
reset();
setResponder((text) =>
  /^\s*INSERT INTO gamedb_filter_views/i.test(text)
    ? {
        rows: [
          {
            id: 5,
            query_id: 7,
            name: "รอดำเนินการ",
            row_filter: "pending",
            lookup_row_filter: { lookupId: "abc", matched: true },
            param_values: { region: "th" },
            created_by: "admin",
            created_at: "now",
          },
        ],
      }
    : null
);
const saved = await insertFilterView({
  queryId: 7,
  name: "รอดำเนินการ",
  rowFilter: "pending",
  lookupRowFilter: { lookupId: "abc", matched: true },
  paramValues: { region: "th" },
  createdBy: "admin",
});
const insert = log.find((entry) => /^\s*INSERT INTO gamedb_filter_views/i.test(entry.text));
ok("insertFilterView writes an INSERT", Boolean(insert));
ok("every value travels as a bound parameter", insert.params.length === 6);
ok("no filter text is ever interpolated into the SQL text", !insert.text.includes("pending"));
ok("insertFilterView returns the saved shape", saved.name === "รอดำเนินการ" && saved.paramValues.region === "th");

// --- listFilterViews ----------------------------------------------------------
reset({
  rows: [
    { id: 1, query_id: 7, name: "a", row_filter: "", lookup_row_filter: null, param_values: {}, created_by: "x", created_at: "now" },
  ],
});
const views = await listFilterViews(7);
ok("listFilterViews maps snake_case columns to camelCase", views[0].queryId === 7);
const select = log.find((entry) => /^\s*SELECT/i.test(entry.text));
ok("listFilterViews scopes by query_id, bound not interpolated", select.params[0] === 7);

// --- deleteFilterView -----------------------------------------------------------
reset();
setResponder((text) => (/^\s*DELETE FROM gamedb_filter_views/i.test(text) ? { rows: [] } : null));
const deleted = await deleteFilterView(7, 5);
const del = log.find((entry) => /^\s*DELETE FROM gamedb_filter_views/i.test(entry.text));
ok("deleteFilterView scopes by both query_id and id", del.params.length === 2 && del.params[0] === 5 && del.params[1] === 7);
// The stub's default DELETE handler answers rowCount from nextRows.length,
// which reset() with no rows leaves at 0 -- exactly "nothing matched".
ok("deleteFilterView reports false when nothing matched", deleted === false);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
