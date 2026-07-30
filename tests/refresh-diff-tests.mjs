import { diffRows } from "./refresh-diff.mjs";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

const columns = [{ name: "id" }, { name: "Rank" }, { name: "GAME" }];
const rows = [
  [1, 3, "LOVE AND DEEPSPACE"],
  [2, 2, "HARRY MAGIC AWAKEN"],
  [3, 1, "HONKAI IMPACT"],
];
const snapshot = () => ({ columns, rows: rows.map((row) => [...row]) });

// Nothing changed at all
let keys = diffRows({ previous: snapshot(), data: snapshot(), pkName: "id" });
ok("identical: nothing highlighted", keys.size === 0);

// One cell changed, one cell highlighted
let next = snapshot();
next.rows[1][1] = 5;
keys = diffRows({ previous: snapshot(), data: next, pkName: "id" });
ok("one edit: one cell", keys.size === 1);
ok("one edit: the right cell", keys.has("1:Rank"));

// THE REPORTED BUG. The edit changed the sort column, so the rows come back in a
// different order. Keyed by id, only the cell that changed is highlighted.
next = {
  columns,
  rows: [
    [3, 1, "HONKAI IMPACT"],
    [2, 2, "HARRY MAGIC AWAKEN"],
    [1, 9, "LOVE AND DEEPSPACE"],
  ],
};
keys = diffRows({ previous: snapshot(), data: next, pkName: "id" });
ok("reordered: only the edited cell", keys.size === 1);
ok("reordered: found at its new row", keys.has("2:Rank"));

// The same input without a key: position is all there is, and it lights up.
const positional = diffRows({ previous: snapshot(), data: next, pkName: "" });
ok("reordered without a key: paints the shuffle", positional.size > 4);
ok("no-key path still finds real changes", positional.has("2:Rank"));

// A pure reorder with no edit at all is silent when keyed
const shuffled = {
  columns,
  rows: [rows[2], rows[0], rows[1]].map((row) => [...row]),
};
keys = diffRows({ previous: snapshot(), data: shuffled, pkName: "id" });
ok("pure reorder: nothing highlighted", keys.size === 0);

// A new row is new, not changed
next = { columns, rows: [...snapshot().rows, [4, 7, "NEW GAME"]] };
keys = diffRows({ previous: snapshot(), data: next, pkName: "id" });
ok("added row: nothing highlighted", keys.size === 0);

// A deleted row leaves the others alone
next = { columns, rows: [snapshot().rows[0], snapshot().rows[2]] };
keys = diffRows({ previous: snapshot(), data: next, pkName: "id" });
ok("removed row: nothing highlighted", keys.size === 0);

// Row count differing no longer blocks the keyed diff
next = {
  columns,
  rows: [
    [1, 3, "LOVE AND DEEPSPACE"],
    [3, 1, "HONKAI IMPACT REBORN"],
  ],
};
keys = diffRows({ previous: snapshot(), data: next, pkName: "id" });
ok("fewer rows, one edit: still caught", keys.size === 1 && keys.has("1:GAME"));

// Without a key, a differing row count means no diff at all rather than a mess
keys = diffRows({ previous: snapshot(), data: next, pkName: "" });
ok("no key, different count: silent", keys.size === 0);

// A pk name that is not in the result falls back to position
keys = diffRows({ previous: snapshot(), data: shuffled, pkName: "ไม่มีคอลัมน์นี้" });
ok("unknown pk name: falls back to position", keys.size > 0);

// Column set changed entirely: nothing to compare
keys = diffRows({
  previous: snapshot(),
  data: { columns: [{ name: "id" }, { name: "Rank" }], rows: [[1, 3]] },
  pkName: "id",
});
ok("columns changed: silent", keys.size === 0);

// Values that only differ by type are not a change
keys = diffRows({
  previous: { columns, rows: [[1, 3, "A"]] },
  data: { columns, rows: [["1", "3", "A"]] },
  pkName: "id",
});
ok("number vs string: not a change", keys.size === 0);

// null becoming a value is a change
keys = diffRows({
  previous: { columns, rows: [[1, null, "A"]] },
  data: { columns, rows: [[1, 4, "A"]] },
  pkName: "id",
});
ok("null to value: a change", keys.size === 1 && keys.has("0:Rank"));

// Duplicate keys: the last one wins rather than throwing
keys = diffRows({
  previous: { columns, rows: [[1, 3, "A"], [1, 4, "B"]] },
  data: { columns, rows: [[1, 4, "B"]] },
  pkName: "id",
});
ok("duplicate keys: survives", keys.size === 0);

console.log(`${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
