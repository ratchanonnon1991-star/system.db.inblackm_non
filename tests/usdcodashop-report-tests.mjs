import assert from "node:assert/strict";
import { codaDateBounds, codaPeriodDates, codaReportCsv, CODA_SHEET_HEADINGS } from "../src/lib/usdcodashop-report.js";
import { createCodaLedger } from "../src/server/usdcodashop-ledger.js";

assert.deepEqual(codaDateBounds(), { start: null, end: null });
assert.deepEqual(codaDateBounds({ dateFrom: "2026-10-17", dateTo: "2026-10-17" }), { start: "2026-10-16T17:00:00.000Z", end: "2026-10-17T17:00:00.000Z" });
assert.equal(codaDateBounds({ dateTo: "2026-12-31" }).end, "2026-12-31T17:00:00.000Z");
for (const dateFrom of ["2026-02-29", "2026-13-01", "2026-04-31", "2026-1-01", "garbage", "0001-01-01", "9999-01-01"]) assert.throws(() => codaDateBounds({ dateFrom }), { status: 400 });
assert.throws(() => codaDateBounds({ dateFrom: "2026-10-18", dateTo: "2026-10-17" }), { status: 400 });
assert.deepEqual(codaPeriodDates("all", ""), { dateFrom: "", dateTo: "" });
assert.deepEqual(codaPeriodDates("month", "2024-02"), { dateFrom: "2024-02-01", dateTo: "2024-02-29" });
assert.deepEqual(codaPeriodDates("month", "2026-02"), { dateFrom: "2026-02-01", dateTo: "2026-02-28" });
assert.deepEqual(codaPeriodDates("year", "2026"), { dateFrom: "2026-01-01", dateTo: "2026-12-31" });
assert.deepEqual(codaPeriodDates("day", "2026-10-17"), { dateFrom: "2026-10-17", dateTo: "2026-10-17" });
assert.deepEqual(codaPeriodDates("range", "2026-10-01", "2026-10-17"), { dateFrom: "2026-10-01", dateTo: "2026-10-17" });
for (const [mode, value, end] of [["month", "2026-00"], ["year", ""], ["range", "2026-01-01", ""], ["day", "2026-02-30"], ["month", "2026-13"]]) assert.throws(() => codaPeriodDates(mode, value, end));
const csv = codaReportCsv([{ id: "1", kind: "order", orderId: '=HYPERLINK("evil")', occurredAt: "2026-10-16T17:00:00Z", amount: "3.70", balance: "0.00", details: {
  customer: 'ลูกค้า,"ทดสอบ"\nแถวสอง', saleThb: "100.00", costThb: "120.00", game: " +SUM(1,2)", playerId: "@evil", invoice: "-cmd", link: "javascript:alert(1)",
}, recordedBy: "Staff" }]);
assert.ok(csv.startsWith('\uFEFF"วันที่"'));
assert.ok(csv.includes('"2026-10-17 00:00:00"'));
assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));
assert.ok(csv.includes('"ลูกค้า,""ทดสอบ""\nแถวสอง"'));
assert.ok(csv.includes('"\' +SUM(1,2)"'));
assert.ok(csv.includes('"\'@evil"')); assert.ok(csv.includes('"\'-cmd"'));
assert.ok(csv.includes('"3.70","0.00"')); assert.ok(!csv.includes("javascript:"));
assert.equal(CODA_SHEET_HEADINGS.length, 20);
assert.ok(codaReportCsv([]).endsWith("\r\n"));
let reportParams;
const client = { query: async () => ({ rows: [] }), release() {} };
const repo = createCodaLedger({ connect: async () => client, query: async (sql, params) => {
  reportParams = params; assert.ok(sql.includes("occurred_at < $4::timestamptz"));
  return { rows: [{ total: 50001 }] };
} });
await assert.rejects(repo.list({ id: 1, permissions: ["projectm.claim"] }, { exportAll: true, page: 9, dateFrom: "2026-10-17", dateTo: "2026-10-17" }), { status: 413 });
assert.deepEqual(reportParams, ["", 0, "2026-10-16T17:00:00.000Z", "2026-10-17T17:00:00.000Z", 50001, "all"]);
console.log("passed: Thai calendar boundaries, periods, CSV escaping, BOM, formula safety, export limit and source values");
