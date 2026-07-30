import { buildAllSql } from "@/server/gamedb-editable-check.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

const full = {
  table: "topup.topup_entry",
  pk: "ID",
  pkColumn: "id",
  columns: ["Rank", "หมายเหตุ"],
  columnMap: { Rank: "rank_stars", "หมายเหตุ": "note" },
  allowInsert: true,
  allowDelete: true,
  inputs: [
    {
      column: "Rank",
      widget: "lookup",
      lookup: { table: "game", valueColumn: "id", labelColumn: "name" },
    },
  ],
};

const groups = buildAllSql(full);
const by = (needle) => groups.find((group) => group.action.includes(needle));
const text = JSON.stringify(groups);

ok("groups: all four kinds", groups.length === 4);
ok("groups: update first", groups[0].action.includes("UPDATE"));
ok("groups: has insert", Boolean(by("INSERT")));
ok("groups: has delete", Boolean(by("DELETE")));
ok("groups: has the dropdown reads", Boolean(by("SELECT")));

const update = by("UPDATE");
ok("update: one entry per column", update.statements.length === 2);
ok("update: shows both names", update.statements[0].label === "Rank → rank_stars");
ok("update: locks then writes",
  update.statements[0].sql.includes("FOR UPDATE") && update.statements[0].sql.includes("UPDATE "));
ok("update: uses the real key column", update.statements[0].sql.includes('WHERE "id" = $2'));
ok("update: never shows the alias", !update.statements[0].sql.includes('"Rank"'));

const insert = by("INSERT");
ok("insert: every allowed column", insert.statements[0].sql.includes('("rank_stars", "note")'));
ok("insert: placeholders match the columns", insert.statements[0].sql.includes("VALUES ($1, $2)"));
ok("insert: returns the key", insert.statements[0].sql.includes('RETURNING "id" AS pk'));
ok("insert: says blanks are dropped, not nulled", insert.note.includes("DEFAULT"));
ok("insert: marked as enabled", insert.always === true);

const del = by("DELETE");
ok("delete: reads before removing", del.statements[0].sql.includes("SELECT * FROM"));
ok("delete: locks the row", del.statements[0].sql.includes("FOR UPDATE"));
ok("delete: one bound key", del.statements[0].sql.includes('DELETE FROM "topup"."topup_entry" WHERE "id" = $1'));
ok("delete: warns about the row count", del.note.includes("rollback"));

const select = by("SELECT");
ok("lookup: label and value aliased", select.statements[0].sql.includes('"id" AS value') && select.statements[0].sql.includes('"name" AS label'));
ok("lookup: from its own table", select.statements[0].sql.includes('FROM "game"'));
ok("lookup: ordered by what is shown", select.statements[0].sql.includes('ORDER BY "name"'));
ok("lookup: capped", /LIMIT \d+/.test(select.statements[0].sql));
ok("lookup: named after the column", select.statements[0].label === "Rank");

ok("nothing interpolates a raw name unquoted", !text.includes("topup_entry\\\","));

// Insert and delete are listed even when off, marked so
const readOnly = buildAllSql({ ...full, allowInsert: false, allowDelete: false });
ok("off: insert still listed", Boolean(readOnly.find((g) => g.action.includes("INSERT"))));
ok("off: insert marked not enabled",
  readOnly.find((g) => g.action.includes("INSERT")).always === false);
ok("off: delete marked not enabled",
  readOnly.find((g) => g.action.includes("DELETE")).always === false);
ok("off: update is always on", readOnly[0].always === true);

// No lookups configured, so no SELECT group at all
const noLookups = buildAllSql({ ...full, inputs: [] });
ok("no lookups: group omitted", !noLookups.find((g) => g.action.includes("SELECT")));

// No columns chosen yet: nothing to update or insert, delete still describable
const noColumns = buildAllSql({ ...full, columns: [], inputs: [] });
ok("no columns: no update statements", !noColumns.find((g) => g.action.includes("UPDATE")));
ok("no columns: no insert statements", !noColumns.find((g) => g.action.includes("INSERT")));
ok("no columns: delete still shown", Boolean(noColumns.find((g) => g.action.includes("DELETE"))));

// Unmapped names fall through to the result name, with no arrow shown
const plain = buildAllSql({
  table: "game_list",
  pk: "id",
  pkColumn: "",
  columns: ["note"],
  columnMap: {},
  allowInsert: false,
  allowDelete: false,
  inputs: [],
});
ok("unmapped: no arrow in the label", plain[0].statements[0].label === "note");
ok("unmapped: unqualified table quoted", plain[0].statements[0].sql.includes('"game_list"'));

// A hostile name is refused rather than rendered
let threw = false;
try {
  buildAllSql({ ...plain, table: 'game";DROP TABLE x;--' });
} catch {
  threw = true;
}
ok("hostile table name refused", threw);

threw = false;
try {
  buildAllSql({
    ...full,
    inputs: [
      {
        column: "Rank",
        widget: "lookup",
        lookup: { table: "game", valueColumn: 'id"', labelColumn: "name" },
      },
    ],
  });
} catch {
  threw = true;
}
ok("hostile lookup column refused", threw);

console.log(`${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
