import assert from "node:assert/strict";
import { mgcPoints, mgcStatus, mgcSerial, mgcFilters, mgcManualInput, mgcOrder, mgcSummary, mgcCsv, mgcBotCost } from "../src/lib/multigamecard-inventory.js";
import { createMultigamecardInventory } from "../src/server/multigamecard-inventory.js";
const admin = { id: 1, username: "Tester", permissions: ["projectm.admin"] };
const dates = { dateFrom: "2026-10-01", dateTo: "2026-10-18" };
assert.equal(mgcPoints("1,000,000"), "1000000.00"); assert.equal(mgcPoints(null), null);
for (const value of ["", "bad", "-1", "Infinity", "1000000000000"]) assert.equal(mgcPoints(value), null);
assert.equal(mgcStatus("0"), "หมดแล้ว"); assert.equal(mgcStatus("49999.99"), "เศษ");
assert.equal(mgcStatus("50000"), "ปกติ"); assert.equal(mgcStatus(null), "ไม่ทราบยอด");
assert.equal(mgcSerial(" abc-01 "), "ABC-01"); assert.throws(() => mgcSerial("';delete"), { status: 400 });
assert.equal(mgcFilters(dates).bounds.start, "2026-09-30T17:00:00.000Z");
for (const bad of [{}, { ...dates, mode: "other" }, { dateFrom: "2026-01-01", dateTo: "2026-10-18" }, { ...dates, serial: "'" }]) assert.throws(() => mgcFilters(bad), { status: 400 });
const requestId = "11111111-1111-4111-8111-111111111111";
const input = mgcManualInput({ action: "card", requestId, serial: "ABC01", owner: "Tester", amount: "0", note: "opening", pin: "MUST_NOT_STORE" });
assert.equal(input.amount, "0.00"); assert.equal(input.pin, undefined);
for (const bad of [{}, { ...input, requestId: "bad" }, { ...input, action: "bot" }, { ...input, note: "" }, { action: "use", requestId, cardId: "1", amount: "1", note: "x" }]) assert.throws(() => mgcManualInput(bad), { status: 400 });
const source = { id: 1, card_serial: "ABC01", redeem_points: "1000", remaining_points: "49000", occurred_at: "2026-10-18T00:00:00Z", game_name: "G", pack_name: "P", transaction_count: 1, cost_thb: "20", sheet_fields: { saleThb: "30" } };
const order = mgcOrder(source);
assert.deepEqual(order.figures, { sale: "30.00", cost: "30.02", profit: "-0.02", margin: "-0.07" });
assert.equal(mgcOrder({ ...source, transaction_count: 2 }).figures.cost, "30.02");
assert.equal(mgcBotCost("4,990"), "149.78");
assert.equal(mgcBotCost("9990"), "299.86");
assert.equal(mgcBotCost("2930"), "87.95");
assert.equal(mgcBotCost("0"), "0.00");
assert.equal(mgcBotCost("0.17"), "0.01");
for (const bad of [null, "", "bad", "-1", "1,2"]) assert.equal(mgcBotCost(bad), null);
assert.equal(mgcOrder({ ...source, remaining_points: null }).balance, null);
assert.equal(mgcSummary([order, mgcOrder({ ...source, cost_thb: "40" })]).profit, "-0.04");
assert.equal(mgcSummary([order, mgcOrder({ ...source, redeem_points: null })]).profit, null);
assert.equal(mgcOrder({ ...source, cost_thb: null }).figures.cost, "30.02");
const csv = mgcCsv([{ ...order, orderId: "=EVIL()", details: { ...order.details, link: "javascript:bad", note: "@formula" } }]);
assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes("'=EVIL()")); assert.ok(csv.includes("'@formula")); assert.ok(!csv.includes("javascript:"));
assert.ok(csv.includes('"30.02"')); assert.ok(csv.includes("ยอดออก / 33.31534305"));
const calls = [];
const repo = createMultigamecardInventory({
  manual: () => ({ read: async () => ({ cards: [], entries: [order] }), save: async () => ({ id: "1" }) }),
  prepareSales: async rows => rows,
  select: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("FROM system_settings")) return [{ serial: "ABC01", balance: "49,000", enabled: "true" }, { serial: "DUP01", balance: "5" }, { serial: "DUP01", balance: "10" }];
    if (sql.includes("GROUP BY c.phone_number")) return [{ serial: "ABC01", used: "1000" }, { serial: "REMOVED01", used: "5" }];
    if (sql.includes("pack_count")) return [];
    if (sql.includes("FROM sheet_jobs")) return [];
    return params[1] === "0" ? [{ ...source, source_order_id: "K1", sale_price: "30", source: "PAGE" }] : [];
  },
});
let result = await repo.list(admin, dates);
assert.equal(result.total, 1); assert.equal(result.summary.profit, "-0.02");
assert.equal(result.cards.find(c => c.serial === "ABC01").balance, "49000.00");
assert.equal(result.cards.find(c => c.serial === "ABC01").inTotal, null);
assert.equal(result.cards.find(c => c.serial === "DUP01").balance, null);
assert.equal(result.cards.some(c => c.serial === "REMOVED01"), false, "only pool serials appear, never old usage-only cards");
assert.ok(calls.every(c => c.sql.trim().startsWith("SELECT"))); assert.ok(calls.every(c => !/cardPin|SELECT\s+\*/i.test(c.sql)), "never fetch PINs or raw settings");
result = await repo.list(admin, { ...dates, serial: "REMOVED01" }); assert.equal(result.total, 0); assert.equal(result.cards.length, 2);
await assert.rejects(repo.list({ id: 2, permissions: [] }, dates), { status: 403 });
assert.equal((await repo.list(admin, { ...dates, mode: "manual" })).total, 1);
console.log("passed: Multigamecard sheet thresholds, exact points, nullable figures, PIN exclusion, readonly Bot, duplicate serials, filters and CSV");
