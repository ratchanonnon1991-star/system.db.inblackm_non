// Isolated PostgreSQL-compatible integration: never uses application databases/providers.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createCodaLedger } from "../src/server/usdcodashop-ledger.js";
import { prepareCodaSales } from "../src/server/usdcodashop-sale-rates.js";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite(); const c = { query: (sql, params) => db.query(sql, params), release() {} };
const pool = { query: c.query, connect: async () => c };
const actor = { id: 16, username: "admin", permissions: ["projectm.admin"] };
const rows = [{ id: 2, source_order_id: "IDR-ORDER", payment_method: "CodashopUSD", status: "completed", transaction_count: 1,
  amount_used: "1.85", balance_after: "13390.34", cost_thb: "60.199", occurred_at: "2026-10-15T13:00:00Z",
  sheet_fields: { saleCurrency: "IDR", saleNative: "36005", saleThb: null } }];
let rate = "0.0018441883"; let calls = 0; const at = "2026-10-17T07:00:00Z";
const repo = createCodaLedger(pool, { boundary: async () => "1", orders: async () => rows }, {
  prepareSales: (orders, previous) => prepareCodaSales(orders, previous, {
    now: () => new Date(at), rateLoader: async (currency) => { calls++; return { currency, rate, source: "test", rateAt: at, fetchedAt: at }; },
  }),
});
try {
  await repo.setup({ boundary: "K7306171", opening: "9373.17", confirm: true }, actor);
  await repo.sync(actor);
  let data = await repo.list(actor);
  assert.equal(data.entries[0].figures.sale, "66.40"); assert.equal(data.entries[0].figures.profit, "6.20");
  assert.equal(data.remaining, "13390.34"); assert.equal(data.used, "1.85");
  assert.equal(data.entries[0].details.saleConversion.rate, rate);
  const auditsBefore = (await db.query("SELECT COUNT(*)::int n FROM gamedb_coda_details_audit")).rows[0].n;
  rate = "0.004"; await repo.sync(actor);
  data = await repo.list(actor);
  assert.equal(calls, 1); assert.equal(data.entries[0].figures.sale, "66.40");
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM gamedb_coda_details_audit")).rows[0].n, auditsBefore);
  rows[0].sheet_fields.saleNative = "72010"; await repo.sync(actor);
  data = await repo.list(actor);
  assert.equal(data.entries[0].figures.sale, "132.80"); assert.equal(data.remaining, "13390.34"); assert.equal(data.used, "1.85");
  // Adding unrelated manual USD credit must not convert it or alter provider balance.
  await repo.deposit({ requestId: "00000000-0000-4000-8000-000000000001", amount: "100", note: "USD receipt" }, actor);
  data = await repo.list(actor);
  assert.equal(data.deposits, "100.00"); assert.equal(data.remaining, "13390.34");
  assert.equal(data.entries.find((e) => e.kind === "deposit").details.saleConversion, undefined);
  console.log("PASS: persist first sale quote, stable replay, exact conversion/profit, audit, changed native sale, USD debit/balance/deposit unchanged");
} finally { await db.close(); }
