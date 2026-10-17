import assert from "node:assert/strict";
import { codaQuickDates, codaEntryWarnings, codaEntryKind } from "../src/lib/usdcodashop-overview.js";

assert.deepEqual(codaQuickDates("today", "2026-12-31T17:00:00Z"), { dateFrom: "2027-01-01", dateTo: "2027-01-01" });
assert.deepEqual(codaQuickDates("yesterday", "2026-12-31T17:00:00Z"), { dateFrom: "2026-12-31", dateTo: "2026-12-31" });
assert.deepEqual(codaQuickDates("yesterday", "2024-03-01T12:00:00Z"), { dateFrom: "2024-02-29", dateTo: "2024-02-29" });
assert.deepEqual(codaQuickDates("month", "2026-10-16T17:00:00Z"), { dateFrom: "2026-10-01", dateTo: "2026-10-17" });
assert.throws(() => codaQuickDates("bad"), { status: 400 });
for (const value of [null, undefined, "", "all"]) assert.equal(codaEntryKind(value), "all");
for (const value of ["order", "deposit"]) assert.equal(codaEntryKind(value), value);
assert.throws(() => codaEntryKind("order' OR 1=1"), { status: 400 });
assert.deepEqual(codaEntryWarnings({ kind: "deposit" }), []);
assert.deepEqual(codaEntryWarnings({ kind: "order", balance: "0.00", details: { saleThb: "0", costThb: "0" } }), []);
assert.deepEqual(codaEntryWarnings({ kind: "order", orderDuplicate: true, transactionDuplicate: true, details: {} }), ["คิวซ้ำ", "ธุรกรรมซ้ำ", "ยอดโอนไม่ครบ", "ต้นทุนไม่ครบ", "ไม่มียอดบอท"]);
assert.deepEqual(codaEntryWarnings({ kind: "order", balance: "123.45", details: { saleThb: "invalid", costThb: "10.123" } }), ["ยอดโอนไม่ครบ"]);
console.log("17 passed");
