import { nextItuneTableSort, sortItuneTableRows } from "@/lib/itune-table-sort.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));
const ids = (rows) => rows.map((row) => row.id).join(",");

const rows = [
  { id: 2, email: "b@example.com", amount: 10, addedAt: "2026-08-20T02:00:00Z" },
  { id: 1, email: "a@example.com", amount: 20, addedAt: "2026-08-20T01:00:00Z" },
];

const ascending = nextItuneTableSort(null, "id");
const descending = nextItuneTableSort(ascending, "id");
const original = nextItuneTableSort(descending, "id");

ok("first click sorts ascending", ids(sortItuneTableRows(rows, ascending)) === "1,2");
ok("second click sorts descending", ids(sortItuneTableRows(rows, descending)) === "2,1");
ok("third click restores original order", sortItuneTableRows(rows, original) === rows);
ok("another column starts ascending", nextItuneTableSort(descending, "email")?.direction === "asc");

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
