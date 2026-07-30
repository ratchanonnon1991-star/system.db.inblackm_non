// Writing back through a SELECT that aliases its columns — which is what every
// readable query does. Modelled on the real topup.topup_entry query.
import { insertRow, deleteRow } from "@/server/gamedb-row-writer.js";
import { updateCell } from "@/server/gamedb-cell-writer.js";
import { log, reset } from "@/lib/db.js";
import { setAllowWrite } from "@/server/gamedb-side-tables.js";
import { normalizeColumnMap, normalizeLayout, realColumnOf, realPkOf } from "@/lib/gamedb-layout.js";
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
const find = (pattern) => log.find((entry) => pattern.test(entry.text));
const statements = () => log.filter((e) => e.text !== "RELEASE").map((e) => e.text.trim());

// The query aliases e.id AS "ID", e.link AS "LINK", e.note AS "หมายเหตุ".
const EDITABLE = normalizeLayout({
  editable: {
    table: "topup.topup_entry",
    pk: "ID",
    pkColumn: "id",
    columns: ["LINK", "หมายเหตุ", "ซ้ำ/ไม่ซ้ำ"],
    columnMap: { LINK: "link", "หมายเหตุ": "note", "ซ้ำ/ไม่ซ้ำ": "is_repeatable" },
    allowInsert: true,
    allowDelete: true,
    inputs: [],
  },
}).editable;

// --- the mapping itself --------------------------------------------------
check("an aliased column resolves to the table column", realColumnOf(EDITABLE, "LINK"), "link");
check("an unmapped column is its own name", realColumnOf(EDITABLE, "other"), "other");
check("the key resolves to its table column", realPkOf(EDITABLE), "id");
check(
  "no pkColumn means the alias is the column",
  realPkOf({ pk: "id", pkColumn: "" }),
  "id"
);
check("an identity mapping is not stored", normalizeColumnMap({ a: "a", b: "c" }), { b: "c" });
check("a blank mapping is not stored", normalizeColumnMap({ a: "  " }), {});
check("a non-object map is empty", normalizeColumnMap("nope"), {});
check("an array map is empty", normalizeColumnMap(["a"]), {});

// --- update through an alias ---------------------------------------------
setAllowWrite(true);
reset({ rows: [{ value: "old" }] });
await updateCell({
  editable: EDITABLE,
  connection: null,
  pkValue: 4,
  column: "หมายเหตุ",
  value: "ใหม่",
});
const update = find(/^\s*UPDATE/);
ok(
  "UPDATE writes the table column, not the label",
  update.text.includes('UPDATE "topup"."topup_entry" SET "note" = $1 WHERE "id" = $2')
);
ok("the Thai label never reaches SQL", !update.text.includes("หมายเหตุ"));
ok("the aliased key never reaches SQL", !update.text.includes('"ID"'));
check("the value and key are bound", update.params, ["ใหม่", 4]);
ok(
  "the row is read by the table column too",
  find(/^\s*SELECT/).text.includes('SELECT "note" AS value FROM "topup"."topup_entry" WHERE "id" = $1')
);

// --- insert through aliases ----------------------------------------------
reset();
await insertRow({
  editable: EDITABLE,
  connection: null,
  values: { LINK: "https://x", "หมายเหตุ": "n", "ซ้ำ/ไม่ซ้ำ": true },
});
const insert = find(/^\s*INSERT/);
ok(
  "INSERT lists table columns",
  insert.text.includes('INSERT INTO "topup"."topup_entry" ("link", "note", "is_repeatable")')
);
ok("INSERT returns the real key column", insert.text.includes('RETURNING "id" AS pk'));
ok("no label leaks into the statement", !/LINK|หมายเหตุ|ซ้ำ/.test(insert.text));
check("values stay bound", insert.params, ["https://x", "n", true]);

// --- delete through an aliased key ---------------------------------------
reset({ rows: [{ id: 4, link: "https://x" }] });
await deleteRow({ editable: EDITABLE, connection: null, pkValue: 4 });
ok(
  "DELETE matches on the table column",
  find(/^\s*DELETE/).text.includes('DELETE FROM "topup"."topup_entry" WHERE "id" = $1')
);

// --- what the sanitizer accepts ------------------------------------------
const clean = sanitizeLayout({
  editable: {
    table: "topup.topup_entry",
    pk: "ID",
    pkColumn: "id",
    // "VPN / NO VPN" is a fine label and an impossible identifier; it is only
    // allowed through because it maps to one that is.
    columns: ["LINK", "VPN / NO VPN", "ซ้ำ/ไม่ซ้ำ"],
    columnMap: { LINK: "link", "VPN / NO VPN": "vpn", "ซ้ำ/ไม่ซ้ำ": "is_repeatable" },
  },
});
check(
  "a label with a slash is allowed when it maps to a real column",
  clean.editable.columns,
  ["LINK", "VPN / NO VPN", "ซ้ำ/ไม่ซ้ำ"]
);
check("the mapping survives", clean.editable.columnMap["VPN / NO VPN"], "vpn");
check("the key mapping survives", clean.editable.pkColumn, "id");

const unmapped = sanitizeLayout({
  editable: { table: "t", pk: "id", columns: ["VPN / NO VPN", "ok_one"] },
});
check(
  "an unmappable label with no mapping is dropped",
  unmapped.editable.columns,
  ["ok_one"]
);

const hostile = sanitizeLayout({
  editable: {
    table: "t",
    pk: "ID",
    pkColumn: 'id" ; DROP TABLE gamedb_users; --',
    columns: ["a"],
    columnMap: { a: 'x" , (SELECT 1)) --' },
  },
});
check("a hostile key column kills the whole config", hostile.editable, null);

const hostileColumn = sanitizeLayout({
  editable: { table: "t", pk: "id", columns: ["a"], columnMap: { a: 'x"; DROP TABLE t; --' } },
});
check("a hostile column mapping drops that column", hostileColumn.editable.columns, []);
check("and drops its mapping with it", hostileColumn.editable.columnMap, {});

// --- configs saved before any of this ------------------------------------
const legacy = normalizeLayout({
  editable: { table: "packages", pk: "id", columns: ["price", "stock"] },
});
check("an old config has no key mapping", legacy.editable.pkColumn, "");
check("an old config has no column mapping", legacy.editable.columnMap, {});
check("its key still resolves", realPkOf(legacy.editable), "id");
check("its columns still resolve", realColumnOf(legacy.editable, "price"), "price");

reset({ rows: [{ value: 1 }] });
await updateCell({
  editable: legacy.editable,
  connection: null,
  pkValue: 7,
  column: "price",
  value: 9,
});
ok(
  "an old config writes exactly as it always did",
  find(/^\s*UPDATE/).text.includes('UPDATE "packages" SET "price" = $1 WHERE "id" = $2')
);

// a column outside the allow-list is still refused, mapping or not
reset({ rows: [{ value: 1 }] });
await rejects(
  "a column that is not allowed is still refused",
  updateCell({ editable: EDITABLE, connection: null, pkValue: 1, column: "Game", value: "x" }),
  { status: 403 }
);
check("a refused column never reaches SQL", statements(), []);

// and a mapping cannot be smuggled in per request: it comes from the config
reset({ rows: [{ value: 1 }] });
await rejects(
  "the real column cannot be passed in as the column name",
  updateCell({ editable: EDITABLE, connection: null, pkValue: 1, column: "note", value: "x" }),
  { status: 403 }
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
