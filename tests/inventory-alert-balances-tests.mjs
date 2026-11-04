import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { balanceReaders } from "../src/server/inventory-alert-balances.js";
import { loadDonshopWallet } from "../src/server/donshop-inventory.js";
import { loadAgenh2hWallet } from "../src/server/agenh2h-inventory.js";
import { createInventoryAlerts } from "../src/server/inventory-alerts.js";
import { reset, setResponder } from "@/lib/db";

let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed++; };
const db = new PGlite();
const select = async (sql, params) => (await db.query(sql, params)).rows;
try {
  await db.exec(`SET TIME ZONE 'UTC';
    CREATE TABLE codashop_orders(id BIGINT PRIMARY KEY,source_order_id TEXT,source TEXT,status TEXT,
      payment_method TEXT,created_at TIMESTAMP,game_name TEXT,pack_name TEXT,provider_response JSONB);
    CREATE TABLE gamedb_coda_wallet(id INTEGER PRIMARY KEY,last_sync TIMESTAMPTZ);
    CREATE TABLE gamedb_coda_ledger(wallet_id INTEGER,source_id BIGINT,kind TEXT,details JSONB,occurred_at TIMESTAMPTZ);
    INSERT INTO gamedb_coda_wallet VALUES(1,'2026-11-02T01:00:00Z');
    INSERT INTO gamedb_coda_ledger VALUES
      (1,200,'order','{"providerBalance":"900.000000"}','2026-11-02T00:00:00Z'),
      (1,100,'order','{"providerBalance":"40.000000"}','2026-11-02T01:00:00Z'),
      (1,NULL,'deposit','{}','2026-11-02T02:00:00Z');`);
  reset();
  setResponder((sql, params) => {
    assert.ok(!sql.includes("gamedb_usdcodashop_inventory"), "alerts must not read the old manual USD table");
    return db.query(sql, params ?? []);
  });
  let usd = (await balanceReaders.usdcodashop())[0];
  check(usd.key === "usdcodashop:USD" && usd.balance === "40.00", "use latest bot provider balance, never the deposit or the highest source ID");
  check(usd.balanceAt === "2026-11-02T01:00:00.000Z");
  await db.exec(`INSERT INTO gamedb_coda_ledger VALUES(1,300,'order','{}','2026-11-02T03:00:00Z')`);
  check((await balanceReaders.usdcodashop())[0].balance === null, "missing newest evidence cannot fall back to an older balance");
  await db.exec(`UPDATE gamedb_coda_ledger SET details='{"providerBalance":"0"}' WHERE source_id=300`);
  check((await balanceReaders.usdcodashop())[0].balance === "0.00", "repeated reads pick up a changed actual balance");
  await db.exec(`UPDATE gamedb_coda_ledger SET details='{"providerBalance":"-1.50"}' WHERE source_id=300`);
  check((await balanceReaders.usdcodashop())[0].balance === "-1.50");
  await db.exec(`DELETE FROM gamedb_coda_wallet`);
  check((await balanceReaders.usdcodashop())[0].balance === null, "unconfigured wallet has no invented opening balance");

  for (const [provider, method, load] of [["donshop", "DonShopIDR", loadDonshopWallet], ["agenh2h", "AgenH2HIDR", loadAgenh2hWallet]]) {
    await db.query(`INSERT INTO codashop_orders VALUES
      (1,'BOT-1','PAGE','completed',$1,'2026-11-02 01:00:00','','','{"_worker_meta":{"balance_before":"1000","live_cost_total":"600"}}'),
      (2,'HAND','PAGE','completed',$1,'2026-11-02 02:00:00','','','{"manual_fulfillment":true}'),
      (3,'FAILED','PAGE','failed',$1,'2026-11-02 03:00:00','','','{"_worker_meta":{"balance_before":"400","live_cost_total":"200"}}')`, [method]);
    const wallet = await load(select), alert = (await balanceReaders[provider](select))[0];
    check(wallet.amount === "400.00" && alert.balance === wallet.amount, `${provider} report and alerts share the same reader`);
    check(alert.key === `${provider}:IDR` && alert.currency === "IDR" && alert.balanceAt === wallet.checkedAt);
    await db.query(`INSERT INTO codashop_orders VALUES(4,'BOT-4','PAGE','completed',$1,'2026-11-02 04:00:00','','','{"_worker_meta":{"balance_before":"400","live_cost":"25","quantity":"2"}}')`, [method]);
    check((await balanceReaders[provider](select))[0].balance === "350.00", "new actual usage updates the balance");
    await db.query(`INSERT INTO codashop_orders VALUES(5,'MISSING','PAGE','completed',$1,'2026-11-02 05:00:00','','','{"_worker_meta":{"live_cost_total":"50"}}')`, [method]);
    check((await load(select)) === null && (await balanceReaders[provider](select))[0].balance === null, "missing latest before balance is unknown in both views");
    await db.exec("DELETE FROM codashop_orders");
  }
  const writes = [], admin = { id: 1, permissions: ["projectm.admin"] };
  const repo = createInventoryAlerts({ pool: { query: async (sql, params) => { writes.push({sql,params}); return {rows:[]}; } },
    balances: async providers => ({ channels: providers.map(provider => ({ key: `${provider}:IDR`, provider, label: provider, currency: "IDR" })) }) });
  for (const provider of ["donshop", "agenh2h"]) {
    await repo.save({ key: `${provider}:IDR`, target: "1000" }, admin);
    check(writes.at(-1).params[0] === `${provider}:IDR`, `${provider} settings are accepted by the API repository`);
  }
} finally { await db.close(); reset(); }
console.log(`${passed} passed`);
