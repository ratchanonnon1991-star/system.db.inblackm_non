import assert from "node:assert/strict";
import { normalizeCodaOrder, signedUsd, depositInput, CODA_METHOD, providerUsd } from "../src/lib/usdcodashop-ledger.js";
import { createCodaSource } from "../src/server/usdcodashop-source.js";
import { createCodaLedger } from "../src/server/usdcodashop-ledger.js";
let passed = 0;
const check = (value) => { assert.ok(value); passed++; };
const raw = { id: 287411, source_order_id: "K7306274", payment_method: CODA_METHOD, status: "completed", transaction_count: 1,
  amount_used: "3.70", occurred_at: "2026-10-15T13:16:11Z", game_name: "Zepeto", pack_name: "7 Zems", balance_after: "9397.75",
  provider_response: { password: "must-never-persist" }, email: "private@example.test", raw_data: { secret: "x" } };
const order = normalizeCodaOrder(raw);
check(order.amount === "3.70"); check(order.orderId === "K7306274"); check(order.details.providerBalance === "9397.75");
check(!JSON.stringify(order).includes("must-never-persist")); check(!JSON.stringify(order).includes("private@example"));
for (const [value, expected] of [[null, null], ["", null], ["bad", null], ["1.001", null], ["0", "0.00"], ["-1.20", "-1.20"], ["9397.750000", "9397.75"], ["-0", "0.00"]]) check(providerUsd(value) === expected);
for (const change of [{ status: "pending" }, { payment_method: "Codashop" }, { transaction_count: 2 }, { transaction_count: 0 }, { amount_used: null, pack_price: "USD3.70" }, { amount_used: "-1" }, { amount_used: "0" }, { amount_used: "1.001" }, { occurred_at: null }, { id: "bad" }]) {
  assert.throws(() => normalizeCodaOrder({ ...raw, ...change }), { status: 409 }); passed++;
}
check(signedUsd(-100n) === "-1.00"); check(signedUsd(937317n - 370n) === "9369.47");
const requestId = "00000000-0000-4000-8000-000000000001";
check(depositInput({ requestId, amount: "100.10", note: " receipt " }).note === "receipt");
for (const change of [{ requestId: "bad" }, { amount: "0" }, { amount: "-2" }, { note: "" }]) {
  assert.throws(() => depositInput({ requestId, amount: "10", note: "ref", ...change }), { status: 400 }); passed++;
}
const calls = []; let page = 0;
const source = createCodaSource(async (sql, params) => {
  calls.push({ sql, params });
  if (sql.includes("DISTINCT ON") || sql.includes("pack_count")) return [];
  if (sql.includes("SELECT DISTINCT")) return [{ id: 287399 }];
  page++; return page === 1 ? Array.from({ length: 500 }, (_, i) => ({ id: 287400 + i })) : [{ id: 288001 }];
});
check(await source.boundary() === "287399"); check((await source.orders("287399")).length === 501);
check(calls[4].params[0] === "287899"); check(calls.every((c) => c.sql.trim().startsWith("SELECT")));
check(calls[1].sql.includes("c.id>$1") && calls[1].params[1] === "CodashopUSD");
for (const rows of [[], [{ id: 1 }, { id: 2 }]]) { await assert.rejects(createCodaSource(async () => rows).boundary(), { status: 409 }); passed++; }
const repo = createCodaLedger({ connect() { throw new Error("must not connect"); } }, source);
const viewer = { id: 2, permissions: ["projectm.claim"] };
for (const method of [() => repo.setup({}, viewer), () => repo.sync(viewer), () => repo.deposit({}, viewer), () => repo.list(null)]) {
  await assert.rejects(method(), { status: 403 }); passed++;
}
console.log(`${passed} passed`);
