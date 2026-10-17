import assert from "node:assert/strict";
import { codaCostQuote, codaCurrentCostFigures } from "../src/lib/usdcodashop-cost.js";
import { createCodaCostRateLoader } from "../src/server/usdcodashop-cost-rate.js";
import { codaReportCsv } from "../src/lib/usdcodashop-report.js";
const quote = { currency: "USD", rate: "33.45", source: "test", rateAt: "2026-10-16T00:00:00Z" };
const row = { kind: "order", amount: "0.92", balance: "12998.29", details: { saleThb: "33.25", costThb: "29.9368" } };
const before = JSON.stringify(row);
assert.deepEqual(codaCurrentCostFigures(row, quote), { sale: "33.25", cost: "30.77", profit: "2.48", margin: "7.46" });
assert.equal(JSON.stringify(row), before);
assert.equal(codaCurrentCostFigures(row, null).cost, null); assert.equal(codaCurrentCostFigures(row, null).profit, null);
assert.equal(codaCurrentCostFigures(row, { ...quote, rate: "34" }).cost, "31.28");
assert.equal(codaCurrentCostFigures({ ...row, kind: "deposit" }, quote).cost, null);
assert.equal(codaCurrentCostFigures({ ...row, amount: "0" }, quote).cost, "0.00");
for (const rate of [null, "0", "-1", "Infinity", "1e5", "=1+2"]) assert.equal(codaCostQuote({ ...quote, rate }), null);
assert.equal(codaCostQuote({ ...quote, currency: "USDT" }), null);
let time = new Date("2026-10-17T07:00:00Z"); let calls = 0;
const loader = createCodaCostRateLoader({ now: () => time, fetchImpl: async (url) => {
  calls++; assert.equal(url, "https://api.frankfurter.dev/v2/rate/USD/THB?providers=ECB");
  return { ok: true, json: async () => ({ rate: 33.45, date: "2026-10-16" }) };
} });
const [one, two] = await Promise.all([loader(), loader()]);
assert.equal(one.rate, "33.45"); assert.equal(two.source, "Frankfurter/ECB"); assert.equal(calls, 1);
time = new Date(time.getTime() + 15 * 60_000 + 1); await loader(); assert.equal(calls, 2);
for (const body of [{ rate: 0, date: "2026-10-16" }, { rate: 33.45, date: "2026-10-01" }, { rate: 33.45, date: "2026-10-20" }, { rate: 33.45, date: "2026-02-30" }, { rate: 33.45 }]) {
  const bad = createCodaCostRateLoader({ now: () => time, fetchImpl: async () => ({ ok: true, json: async () => body }) });
  assert.equal(await bad(), null);
}
let failedCalls = 0;
const unavailable = createCodaCostRateLoader({ now: () => time, fetchImpl: async () => { failedCalls++; throw new Error("private upstream error"); } });
assert.equal(await unavailable(), null); assert.equal(await unavailable(), null); assert.equal(failedCalls, 1);
time = new Date(time.getTime() + 60_001); await unavailable(); assert.equal(failedCalls, 2);
const csv = codaReportCsv([{ ...row, occurredAt: "2026-10-17T12:00:00Z", orderId: "K7316994", figures: codaCurrentCostFigures(row, quote), details: { ...row.details, costConversion: quote } }]);
assert.ok(csv.includes('"33.25","30.77","2.48","7.46"'));
assert.ok(csv.includes('"29.9368","33.45","test"'));
console.log("passed: USD cost formula, precision, source preservation, no hidden fallback, rate validation/cache, matching CSV");
