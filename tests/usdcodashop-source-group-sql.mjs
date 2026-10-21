import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createCodaSource } from "../src/server/usdcodashop-source.js";
import { allocateCodaReceipt } from "../src/lib/usdcodashop-group.js";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`CREATE TABLE codashop_orders(id bigint,source_order_id text,game_name text,pack_name text,payment_method text,status text,source text,telegram_task_request_id text,uid text,provider_response jsonb);
    CREATE TABLE telegram_orders_dev(task_request_id text,order_id text,price numeric,source text,method text,uid text,admin text,booked_by text);
    CREATE TABLE inventory_transactions(order_id bigint,amount_used numeric,cost_thb numeric,balance_after numeric,created_at timestamp);
    CREATE TABLE sheet_jobs(id bigint,order_id text,source text,target text,payload jsonb,created_at timestamptz);
    INSERT INTO telegram_orders_dev VALUES ('REUSED','OLD',100,'kaleoz','UID','uid',NULL,NULL),('REUSED','K',34.21,'kaleoz','UID','uid',NULL,NULL),
      ('WEB-IN881415-6099-1','IN881415-6099-1',72.50,NULL,NULL,'uid',NULL,NULL),('CONFLICT','A',10,'page',NULL,NULL,NULL,NULL),('CONFLICT','B',20,'page',NULL,NULL,NULL,NULL);
    INSERT INTO codashop_orders VALUES
      (1,'K:pack:1','Zepeto','14 Zems','CodashopUSD','completed','kaleoz','REUSED','uid','[]'),
      (2,'K:pack:2','Zepeto','14 Zems','CodashopUSD','completed','kaleoz','REUSED','uid','[]'),
      (3,'K:pack:3','Zepeto','14 Zems','CodashopUSD','completed','page','REUSED','uid','[]'),
      (4,'6332','Zepeto','58 Zems','CodashopUSD','completed','inblackm_web','WEB-IN881415-6099-1','uid','[]'),
      (5,'BAD','Zepeto','14 Zems','CodashopUSD','completed','page','CONFLICT','uid','[]');
    INSERT INTO inventory_transactions SELECT id,0.47,15.82,100-id,'2026-10-18 22:16:00'::timestamp FROM codashop_orders;`);
  const source = createCodaSource(async (sql, args) => {
    assert.ok(sql.trim().startsWith("SELECT")); assert.ok(!sql.includes("raw_data"));
    return (await db.query(sql, args)).rows;
  });
  const rows = await source.orders("0");
  assert.equal(rows.length, 5, "reused task must not multiply bot rows");
  const first = allocateCodaReceipt(rows[0].sheet_fields), second = allocateCodaReceipt(rows[1].sheet_fields);
  assert.equal(first.saleThb, "17.11"); assert.equal(second.saleThb, "17.10");
  assert.equal(rows[0].sale_order_id, "K"); assert.equal(rows[0].sale_price, "34.21");
  assert.equal(allocateCodaReceipt(rows[2].sheet_fields).saleThb, "34.21", "same label across source has its own cohort");
  assert.equal(allocateCodaReceipt(rows[3].sheet_fields).saleThb, "72.50");
  assert.equal(rows[3].sheet_fields.saleCurrency, "THB");
  assert.equal(rows[4].sheet_fields.saleThb, null, "ambiguous receipt must not be guessed");
  assert.equal(rows[4].sheet_fields.saleAmbiguous, true);
  console.log("PASS: exact web THB receipt, reused task safety, source isolation, global exact-satang allocation, ambiguous receipt remains unknown");
} finally { await db.close(); }
