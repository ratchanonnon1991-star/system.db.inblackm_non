import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createMultigamecardInventory } from "../src/server/multigamecard-inventory.js";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`CREATE TABLE system_settings(setting_key text,setting_value text);
    CREATE TABLE codashop_orders(id bigint,phone_number text,source_order_id text,game_name text,pack_name text,source text,
      created_at timestamptz,invoice_txn_id text,provider_response jsonb,telegram_task_request_id text,status text,uid text);
    CREATE TABLE telegram_orders_dev(task_request_id text,order_id text,price numeric,source text,method text,uid text,admin text,booked_by text);
    CREATE TABLE inventory_transactions(order_id bigint,cost_thb numeric);
    CREATE TABLE sheet_jobs(order_id text,source text,payload jsonb,target text,created_at timestamptz,id bigint);`);
  await db.query("INSERT INTO system_settings VALUES($1,$2)", ["oxide_payment_card", JSON.stringify({ cards: [{ cardSerial: "ABC123", cardPin: "SECRET_TEST_PIN", balance: "49,000", enabled: true, balanceUpdatedAt: "2026-10-18T00:00:00Z" }] })]);
  await db.exec(`INSERT INTO telegram_orders_dev VALUES ('PAGE-1','K1',30,'PAGE','uid','u1','Staff',NULL);
    INSERT INTO inventory_transactions VALUES (1,20);
    INSERT INTO codashop_orders VALUES
      (1,'ABC123','K1','Oxide','Pack','PAGE','2026-10-18T00:00:00Z','TX1','{"payment":{"molGameCard":{"redeemPoints":"1,000","remainingBalance":"49,000"}}}','PAGE-1','completed','u1'),
      (2,'ABC123','FAIL','Oxide','Pack','PAGE','2026-10-18T00:01:00Z','TX2','{"payment":{"molGameCard":{"redeemPoints":"2","remainingBalance":"48,998"}}}',NULL,'failed','u2');`);
  let requests = 0;
  const repo = createMultigamecardInventory({ select: async (sql, params) => {
    assert.ok(sql.trim().startsWith("SELECT")); requests++;
    const { rows } = await db.query(sql, params);
    assert.ok(!JSON.stringify(rows).includes("SECRET_TEST_PIN"));
    return rows;
  }, prepareSales: async rows => rows });
  const actor = { id: 16, permissions: ["projectm.claim"] }, query = { dateFrom: "2026-10-18", dateTo: "2026-10-18" };
  let data = await repo.list(actor, query);
  assert.equal(data.total, 1); assert.equal(data.summary.profit, "10.00");
  assert.equal(data.cards[0].balance, "49000.00"); assert.equal(data.cards[0].outTotal, "1000.00");
  assert.equal(data.entries[0].balance, "49000.00"); assert.ok(requests >= 5);
  assert.equal((await repo.list(actor, { ...query, dateFrom: "2026-10-17", dateTo: "2026-10-17" })).cards[0].balance, "49000.00");
  await db.exec(`INSERT INTO codashop_orders VALUES
    (3,'ABC123','BAD','Oxide','Pack','PAGE','2026-10-18T00:02:00Z',NULL,'{"payment":{"molGameCard":{"redeemPoints":"1,2","remainingBalance":"bad"}}}',NULL,'completed','u3');`);
  data = await repo.list(actor, query);
  assert.equal(data.total, 2); assert.equal(data.cards[0].outTotal, null);
  assert.equal(data.entries[0].amount, null); assert.equal(data.entries[0].balance, null);
  assert.equal(data.summary.cost, null); assert.equal(data.summary.profit, null);
  console.log("PASS: actual Bot SQL projections, no PIN disclosure, completed only, totals, nullable malformed amounts, source snapshots, sale/cost join");
} finally { await db.close(); }
