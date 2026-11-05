// The pre-change query is a frozen financial oracle, executed only in local PGlite.
import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import { createCodaLedger } from "../src/server/usdcodashop-ledger.js";
import { CODA_REPORT_SQL } from "../src/server/usdcodashop-report-query.js";

const original = fs.readFileSync(new URL("./fixtures/usdcodashop-ledger-before-performance.sql", import.meta.url), "utf8");
const db = new PGlite();
let baseline = false, passed = 0;
const client = { query: (sql, values) => db.query(baseline && sql === CODA_REPORT_SQL ? original : sql, values), release() {} };
const pool = { connect: async () => client, query: client.query };
const actor = { id: 1, permissions: ["projectm.admin"] };
let rate = "33.66";
const repo = createCodaLedger(pool, { boundary: async () => "1", orders: async () => [] }, {
  loadCostRate: async () => rate ? { currency: "USD", rate, source: "fixture" } : null,
});
try {
  await repo.setup({ boundary: "K7306171", opening: "10000", confirm: true }, actor);
  const entries = Array.from({ length: 360 }, (_, i) => ({ source_id: i + 2, order_label: `ORDER-${Math.floor(i / 3)}`,
    amount: (i % 7 + 1) / 100, occurred_at: new Date(Date.UTC(2026, 9, 17 + i % 5, 12, 0, i % 60)).toISOString(),
    details: { source: i % 19 === 0 ? "page" : "kaleoz", game: `Game ${i % 11}`, pack: `Pack ${i % 7}`,
      invoice: i % 23 === 0 ? "SHARED, EXTRA" : `TX-${i}`, saleThb: i % 17 === 0 ? null : i % 13 === 0 ? "0" : "5.01",
      costThb: i % 31 === 0 ? null : "1.20", saleNative: i % 37 === 0 ? "conflicting" : "15.03", saleCurrency: "THB",
      providerBalance: i % 43 === 0 ? null : "9200.00", note: "metadata ".repeat(45) } }));
  // One customer order crosses page/date boundaries. It must never lose sibling fills.
  entries.push(...Array.from({ length: 110 }, (_, i) => ({ source_id: i + 2000, order_label: "BIG-ORDER", amount: 0.01,
    occurred_at: new Date(Date.UTC(2026, 9, 17 + i % 2, 16)).toISOString(),
    details: { source: "itemku", saleThb: "0.01", costThb: "0.01", saleNative: "1.50", saleCurrency: "THB", game: "Big Game", pack: `Big ${i}`, invoice: `BIG-${i}` } })));
  await db.query(`INSERT INTO gamedb_coda_ledger(kind,source_id,order_label,amount,occurred_at,details,actor_id,actor_label)
    SELECT 'order',source_id,order_label,amount,occurred_at,details,1,'Fixture'
    FROM jsonb_to_recordset($1::jsonb) AS r(source_id bigint,order_label text,amount numeric,occurred_at timestamptz,details jsonb)`, [JSON.stringify(entries)]);
  await repo.deposit({ requestId: "00000000-0000-4000-8000-000000000001", amount: "10.00", note: "receipt" }, actor);
  const cases = [{}, { page: 2 }, { page: 999 }, { pageSize: 25 }, { pageSize: 25, page: 2 }, { pageSize: 25, page: 5 }, { pageSize: 50, page: 2 }, { pageSize: 200 }, { exportAll: true, pageSize: 25 }, { search: "Game 3" }, { search: "BIG-ORDER" },
    { search: "Big 12" }, { kind: "deposit" }, { kind: "order", dateFrom: "2026-10-18", dateTo: "2026-10-18" },
    { profitStatus: "profit" }, { profitStatus: "loss" }, { profitStatus: "missing" },
    { profitStatus: "breakeven" }, { profitUnit: "percent", profitMin: "-100", profitMax: "50" }, { exportAll: true }];
  for (const value of ["33.66", null]) {
    rate = value;
    for (const query of cases) {
      baseline = true; const before = await repo.list(actor, query);
      baseline = false; const after = await repo.list(actor, query);
      assert.deepEqual(after, before, `financial parity for rate=${rate}, query=${JSON.stringify(query)}`); passed++;
    }
  }
  rate = "33.66";
  const firstPage = await repo.list(actor, { pageSize: 25 });
  const secondPage = await repo.list(actor, { pageSize: 25, page: 2 });
  const exported = await repo.list(actor, { pageSize: 25, exportAll: true });
  assert.deepEqual([...firstPage.entries, ...secondPage.entries], exported.entries.slice(0, 50), "SQL pages preserve full logical groups and stable order"); passed++;
  assert.deepEqual(firstPage.summary, exported.summary, "global financial totals are independent of page size"); passed++;
  assert.equal(firstPage.entries.length, 25); passed++;
  assert.ok(exported.entries.length > 25, "CSV export does not inherit the UI page size"); passed++;
  const timings = { fixtureRows: entries.length, costRate: rate, baselineMs: [], optimizedMs: [], production: false };
  // Paired warm measurements, with the same immutable fixture and rate.
  for (let i = 0; i < 3; i++) for (const mode of i % 2 ? [false, true] : [true, false]) {
    baseline = mode; const start = performance.now(); await repo.list(actor);
    timings[mode ? "baselineMs" : "optimizedMs"].push(Number((performance.now() - start).toFixed(2)));
  }
  if (process.env.INVENTORY_PERF_REPORT) fs.writeFileSync(process.env.INVENTORY_PERF_REPORT, JSON.stringify(timings, null, 2));
  console.log(`${passed} passed, 0 failed`);
  console.log(JSON.stringify(timings));
} finally { await db.close(); }
