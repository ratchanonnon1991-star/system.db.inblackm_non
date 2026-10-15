// Optional real PostgreSQL-compatible integration. No application/remote DB writes.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createCodaLedger } from "../src/server/usdcodashop-ledger.js";
import { AUTO_SYNC_ACTOR } from "../scripts/lib/usdcodashop-auto-sync.mjs";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const client = { query: (sql, params) => db.query(sql, params), release() {} };
const pool = { query: client.query, connect: async () => client };
const admin = { id: 16, username: "khong", permissions: ["projectm.admin"] };
const viewer = { id: 17, permissions: ["projectm.claim"] };
let orders = [{ id: 287411, source_order_id: "K7306274", payment_method: "CodashopUSD", status: "completed", transaction_count: 1,
  amount_used: "3.70", occurred_at: "2026-10-15T13:16:11Z", game_name: "Zepeto", pack_name: "7 Zems", balance_after: "9397.75" }];
const repo = createCodaLedger(pool, { boundary: async () => "287399", orders: async () => orders });
const requestId = "00000000-0000-4000-8000-000000000001";
try {
  assert.equal((await repo.list(admin)).configured, false);
  await assert.rejects(repo.setup({ boundary: "K7306171", opening: "9373.17" }, admin), { status: 400 });
  await repo.setup({ boundary: "K7306171", opening: "9373.17", confirm: true }, admin);
  await repo.setup({ boundary: "K7306171", opening: "9373.17", confirm: true }, admin);
  await assert.rejects(repo.setup({ boundary: "K7306171", opening: "9401.45", confirm: true }, admin), { status: 409 });
  assert.equal((await repo.sync(admin)).added, 1);
  assert.equal((await repo.sync(admin)).added, 0);
  let data = await repo.list(viewer);
  assert.equal(data.used, "3.70"); assert.equal(data.remaining, "9369.47"); assert.equal(data.entries.length, 1);
  assert.equal(data.canManage, false); assert.equal(Number(data.entries[0].balance), 9369.47);
  assert.equal(data.entries[0].details.providerBalance, "9397.75");
  // A late completion with a smaller source id still appears on the next full scan.
  orders.push({ ...orders[0], id: 287400, source_order_id: "LATE", amount_used: "0.10", occurred_at: "2026-10-15T13:12:00Z" });
  assert.equal((await repo.sync(admin)).added, 1);
  data = await repo.list(admin, { search: "K7306274" });
  assert.equal(data.total, 1); assert.equal(Number(data.entries[0].balance), 9369.37);
  assert.equal(data.remaining, "9369.37");
  // Source correction must not silently rewrite the persisted amount.
  orders[0] = { ...orders[0], amount_used: "4.00" };
  await assert.rejects(repo.sync(admin), { status: 409 });
  assert.equal((await repo.list(admin)).remaining, "9369.37");
  orders[0] = { ...orders[0], amount_used: "3.70" };
  const deposit = { requestId, amount: "100.10", note: "USD receipt" };
  await repo.deposit(deposit, admin); await repo.deposit(deposit, admin);
  assert.equal((await repo.list(admin)).deposits, "100.10");
  assert.equal((await repo.list(admin)).remaining, "9469.47");
  await assert.rejects(repo.deposit({ ...deposit, amount: "200" }, admin), { status: 409 });
  await assert.rejects(repo.deposit(deposit, viewer), { status: 403 });
  // The complete batch rolls back when any source order is ambiguous.
  orders.push({ ...orders[0], id: 287420, source_order_id: "MISSING", transaction_count: 0 });
  await assert.rejects(repo.sync(admin), { status: 409 });
  assert.equal((await repo.list(admin)).total, 3);
  orders.pop();
  // Ledger survives deletion at the source; no automatic refund on a missing row.
  orders = [];
  await repo.sync(admin); assert.equal((await repo.list(admin)).used, "3.80");
  // Actual SQL transaction rollback on a failure midway through a batch.
  await db.exec("ALTER TABLE gamedb_coda_ledger ADD CONSTRAINT test_reject CHECK(order_label <> 'REJECT') NOT VALID");
  orders = [
    { id: 287500, source_order_id: "ACCEPT", payment_method: "CodashopUSD", status: "completed", transaction_count: 1, amount_used: "1", occurred_at: "2026-10-15T13:30:00Z" },
    { id: 287501, source_order_id: "REJECT", payment_method: "CodashopUSD", status: "completed", transaction_count: 1, amount_used: "1", occurred_at: "2026-10-15T13:31:00Z" },
  ];
  await assert.rejects(repo.sync(admin)); assert.equal((await repo.list(admin)).used, "3.80");
  // Large real debit remains visible as a negative balance, never clamped to zero.
  orders = [{ ...orders[0], amount_used: "10000.00" }];
  await repo.sync(admin); assert.equal((await repo.list(admin)).remaining, "-530.53");
  await repo.recordWorkerStatus(AUTO_SYNC_ACTOR, { state: "syncing" });
  assert.equal((await repo.list(viewer)).autoSync.state, "syncing");
  orders.push({ ...orders[0], id: 287502, source_order_id: "AUTO", amount_used: "0.01" });
  await repo.sync(AUTO_SYNC_ACTOR);
  assert.equal((await repo.list(viewer, { search: "AUTO" })).entries[0].recordedBy, "USDCodashop Auto Sync");
  await repo.recordWorkerStatus(AUTO_SYNC_ACTOR, { state: "ok" });
  const success = (await repo.list(admin)).autoSync.last_success;
  assert.ok(success);
  await repo.recordWorkerStatus(AUTO_SYNC_ACTOR, { state: "error", error: "ตรวจ Order K1" });
  const status = (await repo.list(admin)).autoSync;
  assert.equal(status.state, "error"); assert.equal(status.last_success, success);
  assert.equal(status.error_message, "ตรวจ Order K1");
  await assert.rejects(repo.recordWorkerStatus(viewer, { state: "ok" }), { status: 403 });
  await repo.recordWorkerStatus(AUTO_SYNC_ACTOR, { state: "stopped" });
  assert.equal((await repo.list(admin)).autoSync.state, "stopped");
  assert.equal((await repo.list(admin, { search: "no result" })).total, 0);
  assert.equal((await repo.list(admin, { page: 2 })).entries.length, 0);
  console.log("PASS: setup, fixed boundary, replay, late completion, exact cents, deposit retry, audit, search running balances, permissions, source deletion, rollback, negative balance");
} finally { await db.close(); }
