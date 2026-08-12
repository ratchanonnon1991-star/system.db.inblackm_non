// gamedb-cell-writer.js: peekCell (a live, lock-free read) and updateCell's
// expectedValue check -- the two halves of "don't silently overwrite a value
// someone else already changed while this browser had a stale one on screen."
import { peekCell, updateCell } from "@/server/gamedb-cell-writer.js";
import { log, reset, setResponder } from "@/lib/db.js";
import { setAllowWrite } from "@/server/gamedb-side-tables.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

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

const EDITABLE = { table: "packages", pk: "id", pkColumn: "", columns: ["price"], columnMap: {} };

// --- peekCell ------------------------------------------------------------
reset({ rows: [{ value: 42 }] });
setAllowWrite(true);
const peeked = await peekCell({ editable: EDITABLE, connection: null, pkValue: 7, column: "price" });
check("peekCell returns the live value", peeked.value, 42);
check("peekCell never writes anything", log.some((e) => /^\s*(UPDATE|INSERT|DELETE)/i.test(e.text)), false);
check("peekCell does not lock the row (no FOR UPDATE)", log.some((e) => /FOR UPDATE/i.test(e.text)), false);

reset({ rows: [] });
await rejects("peekCell refuses a row that no longer exists", peekCell({ editable: EDITABLE, connection: null, pkValue: 7, column: "price" }), { status: 404 });

// --- updateCell: expectedValue matches ------------------------------------
reset();
setAllowWrite(true);
setResponder((text) => {
  if (/FOR UPDATE/i.test(text)) return { rows: [{ value: "100" }], rowCount: 1 };
  if (/^\s*UPDATE/i.test(text)) return { rows: [{ value: "150" }], rowCount: 1 };
  return null;
});
const matched = await updateCell({
  editable: EDITABLE,
  connection: null,
  pkValue: 7,
  column: "price",
  value: "150",
  expectedValue: "100",
});
check("a matching expectedValue lets the write through", matched.newValue, "150");
check("the UPDATE actually ran", log.some((e) => /^\s*UPDATE/i.test(e.text)), true);

// --- updateCell: expectedValue is stale (someone else changed it) --------
reset();
setAllowWrite(true);
setResponder((text) => {
  if (/FOR UPDATE/i.test(text)) return { rows: [{ value: "999" }], rowCount: 1 };
  return null;
});
await rejects(
  "a stale expectedValue is refused with a conflict, not silently overwritten",
  updateCell({
    editable: EDITABLE,
    connection: null,
    pkValue: 7,
    column: "price",
    value: "150",
    expectedValue: "100",
  }),
  { status: 409, fragment: "999" }
);
check("no UPDATE ran once the conflict was detected", log.some((e) => /^\s*UPDATE/i.test(e.text)), false);

// --- updateCell: no expectedValue given (unconditional write, e.g. after a
// confirmed overwrite, or bulk-paste edits that never captured one) --------
reset();
setAllowWrite(true);
setResponder((text) => {
  if (/FOR UPDATE/i.test(text)) return { rows: [{ value: "anything at all" }], rowCount: 1 };
  if (/^\s*UPDATE/i.test(text)) return { rows: [{ value: "150" }], rowCount: 1 };
  return null;
});
const forced = await updateCell({
  editable: EDITABLE,
  connection: null,
  pkValue: 7,
  column: "price",
  value: "150",
});
check("omitting expectedValue writes regardless of the current value", forced.newValue, "150");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}
