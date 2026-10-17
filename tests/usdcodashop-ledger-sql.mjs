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
  assert.equal((await repo.list(admin)).remaining, null, "opening is not a provider wallet snapshot");
  await repo.setup({ boundary: "K7306171", opening: "9373.17", confirm: true }, admin);
  await assert.rejects(repo.setup({ boundary: "K7306171", opening: "9401.45", confirm: true }, admin), { status: 409 });
  assert.equal((await repo.sync(admin)).added, 1);
  assert.equal((await repo.sync(admin)).added, 0);
  let data = await repo.list(viewer);
  assert.equal(data.used, "3.70"); assert.equal(data.calculatedRemaining, "9369.47"); assert.equal(data.entries.length, 1);
  assert.equal(data.canManage, false); assert.equal(Number(data.entries[0].calculatedBalance), 9369.47);
  assert.equal(data.remaining, "9397.75"); assert.equal(data.entries[0].balance, "9397.75");
  assert.equal(data.balanceOrderId, "K7306274");
  assert.equal((await repo.list(viewer, { dateFrom: "2026-10-15", dateTo: "2026-10-15" })).total, 1);
  const outside = await repo.list(viewer, { dateFrom: "2026-10-16", dateTo: "2026-10-16" });
  assert.equal(outside.total, 0); assert.equal(outside.remaining, "9397.75"); assert.equal(outside.used, "3.70");
  await assert.rejects(repo.list(viewer, { dateFrom: "2026-02-30" }), { status: 400 });
  assert.equal((await repo.list(viewer, { exportAll: true, page: 2 })).entries.length, 1);
  await assert.rejects(repo.list({ id: 99, permissions: [] }, { exportAll: true }), { status: 403 });
  assert.equal(data.entries[0].details.providerBalance, "9397.75");
  // A late completion with a smaller source id still appears on the next full scan.
  orders.push({ ...orders[0], id: 287400, source_order_id: "LATE", amount_used: "0.10", occurred_at: "2026-10-15T13:12:00Z" });
  assert.equal((await repo.sync(admin)).added, 1);
  data = await repo.list(admin, { search: "K7306274" });
  assert.equal(data.total, 1); assert.equal(Number(data.entries[0].calculatedBalance), 9369.37);
  assert.equal(data.calculatedRemaining, "9369.37"); assert.equal(data.remaining, "9397.75");
  // Source correction must not silently rewrite the persisted amount.
  orders[0] = { ...orders[0], amount_used: "4.00" };
  await assert.rejects(repo.sync(admin), { status: 409 });
  assert.equal((await repo.list(admin)).calculatedRemaining, "9369.37");
  orders[0] = { ...orders[0], amount_used: "3.70" };
  // Corrections/backfilled balance_after update snapshots, with audit, never another debit.
  orders[0].balance_after = "9400.00";
  assert.equal((await repo.sync(admin)).balancesUpdated, 1);
  assert.equal((await repo.list(admin)).remaining, "9400.00");
  assert.equal((await repo.sync(admin)).balancesUpdated, 0);
  const balanceAudit = (await db.query("SELECT * FROM gamedb_coda_balance_audit")).rows;
  assert.equal(balanceAudit.length, 1); assert.equal(balanceAudit[0].previous_balance, "9397.75");
  assert.equal(balanceAudit[0].new_balance, "9400.00");
  orders[0].balance_after = null; await repo.sync(admin);
  assert.equal((await repo.list(admin)).remaining, null, "do not fall back to an older order's wallet balance");
  orders[0].balance_after = "0"; await repo.sync(admin);
  assert.equal((await repo.list(admin)).remaining, "0.00", "zero is a valid source balance, not missing");
  orders[0].balance_after = "9397.75"; await repo.sync(admin);
  orders[0].sheet_fields = { saleThb: "147.25", customer: "Test buyer", playerId: "uid1", sheetOperator: "BoT AtOM" };
  orders[0].cost_thb = "120.398";
  orders[0].invoice_number = "SHARED, UNIQUE"; orders[1].invoice_number = "SHARED";
  await repo.sync(admin);
  const enriched = (await repo.list(admin, { search: "Test buyer" })).entries[0];
  assert.equal(enriched.figures.profit, "26.85"); assert.equal(enriched.figures.margin, "18.23");
  assert.equal(enriched.transactionDuplicate, true, "check each invoice even in multi-invoice orders");
  const metadataCount = (await db.query("SELECT COUNT(*)::int n FROM gamedb_coda_details_audit")).rows[0].n;
  await repo.sync(admin);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM gamedb_coda_details_audit")).rows[0].n, metadataCount, "unchanged JSONB key order must not create audit rows every minute");
  const deposit = { requestId, amount: "100.10", note: "USD receipt" };
  await repo.deposit(deposit, admin); await repo.deposit(deposit, admin);
  assert.equal((await repo.list(admin)).deposits, "100.10");
  assert.equal((await repo.list(admin)).calculatedRemaining, "9469.47");
  assert.equal((await repo.list(admin)).remaining, "9397.75", "manual deposit must not be added to balance_after");
  assert.equal((await repo.list(admin, { search: "receipt" })).remaining, "9397.75");
  assert.equal((await repo.list(admin, { search: "receipt" })).entries[0].balance, null);
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
  await repo.sync(admin); assert.equal((await repo.list(admin)).calculatedRemaining, "-530.53");
  assert.equal((await repo.list(admin)).remaining, null);
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
  // Latest wallet snapshot is chosen independently of filters/pages and deterministic on equal timestamps.
  orders.push({ ...orders[0], id: 287503, source_order_id: "NEWEST", amount_used: "0.02", balance_after: "9324.48" });
  await repo.sync(admin);
  assert.equal((await repo.list(admin, { search: "K7306274" })).remaining, "9324.48");
  assert.equal((await repo.list(admin, { page: 2 })).balanceOrderId, "NEWEST");
  assert.equal((await repo.list(admin, { search: "NEWEST" })).entries[0].balance, "9324.48");
  // A failed correction audit rolls back the snapshot change, too.
  await db.exec("ALTER TABLE gamedb_coda_balance_audit ADD CONSTRAINT test_balance_audit CHECK(new_balance <> '9999.00') NOT VALID");
  orders.at(-1).balance_after = "9999.00";
  await assert.rejects(repo.sync(admin));
  assert.equal((await repo.list(admin)).remaining, "9324.48");
  // Export must include every page from one snapshot, with Thai-day inclusive boundaries.
  await db.exec(`INSERT INTO gamedb_coda_ledger(kind,source_id,order_label,amount,occurred_at,details,actor_id,actor_label)
    SELECT 'order',900000+n,'REPORT-'||n,0.01,'2026-12-31T17:00:00Z'::timestamptz+n*interval '1 second',
      '{"providerBalance":"9000.00","invoice":"SHARED"}'::jsonb,16,'Test'
    FROM generate_series(1,121) n`);
  const options = { search: "REPORT-", dateFrom: "2027-01-01", dateTo: "2027-01-01" };
  assert.equal((await repo.list(viewer, options)).entries.length, 100);
  assert.equal((await repo.list(viewer, { ...options, page: 2 })).entries.length, 21);
  const fullReport = await repo.list(viewer, { ...options, page: 2, exportAll: true });
  assert.equal(fullReport.entries.length, 121); assert.equal(fullReport.total, 121);
  assert.equal(new Set(fullReport.entries.map((entry) => entry.id)).size, 121);
  assert.equal(fullReport.entries[0].transactionDuplicate, true);
  assert.equal(fullReport.entries.at(-1).balance, "9000.00");
  assert.equal((await repo.list(viewer, { ...options, dateFrom: "2026-12-31", dateTo: "2026-12-31" })).total, 0);
  await db.exec(`INSERT INTO gamedb_coda_ledger(kind,source_id,order_label,amount,occurred_at,details,actor_id,actor_label)
    VALUES ('order',999000,'MIDNIGHT-START',0.01,'2026-12-31T17:00:00Z','{}',16,'Test'),
           ('order',999001,'MIDNIGHT-END',0.01,'2027-01-01T17:00:00Z','{}',16,'Test')`);
  const midnights = await repo.list(viewer, { search: "MIDNIGHT", dateFrom: "2027-01-01", dateTo: "2027-01-01", exportAll: true });
  assert.deepEqual(midnights.entries.map((entry) => entry.orderId), ["MIDNIGHT-START"]);
  // Summary is over the entire filtered result, not the current page. Decimal rounding matches each row.
  await db.exec(`UPDATE gamedb_coda_ledger SET details=details || '{"saleThb":" 10.005 ","costThb":"6.004"}'::jsonb WHERE order_label LIKE 'REPORT-%'`);
  const overview = await repo.list(viewer, { ...options, kind: "order", page: 2 });
  assert.equal(overview.entries.length, 21); assert.equal(overview.summary.orders, 121);
  assert.equal(Number(overview.summary.sale), 1211.21); assert.equal(Number(overview.summary.cost), 726);
  assert.equal(Number(overview.summary.profit), 485.21); assert.equal(overview.summary.missingSales, 0);
  assert.equal(overview.summary.duplicateTransactions, 121);
  assert.equal(overview.entries[0].figures.profit, "4.01");
  assert.deepEqual((await repo.list(viewer, { ...options, exportAll: true, kind: "order" })).summary, overview.summary);
  await db.exec(`UPDATE gamedb_coda_ledger SET details=details || '{"saleThb":"oops","costThb":null}'::jsonb WHERE order_label='REPORT-1'`);
  const incomplete = await repo.list(viewer, { ...options, kind: "order" });
  assert.equal(incomplete.summary.sale, null); assert.equal(incomplete.summary.cost, null); assert.equal(incomplete.summary.profit, null);
  assert.equal(incomplete.summary.missingSales, 1); assert.equal(incomplete.summary.missingCosts, 1);
  const noEntries = await repo.list(viewer, { search: "never-exists", kind: "order" });
  assert.equal(Number(noEntries.summary.sale), 0); assert.equal(Number(noEntries.summary.profit), 0);
  const depositTab = await repo.list(viewer, { kind: "deposit", exportAll: true });
  assert.equal(depositTab.total, 1); assert.equal(depositTab.entries[0].kind, "deposit");
  assert.equal(depositTab.summary.orders, 0); assert.equal(Number(depositTab.summary.depositUsd), 100.10);
  assert.equal(depositTab.remaining, noEntries.remaining, "tabs never change the authoritative latest wallet snapshot");
  const noDeposits = await repo.list(viewer, { ...options, kind: "deposit" });
  assert.equal(noDeposits.total, 0); assert.equal(Number(noDeposits.summary.depositUsd), 0);
  await db.exec(`UPDATE gamedb_coda_ledger SET details=details || '{"saleThb":"0","costThb":"1.005"}'::jsonb WHERE order_label='MIDNIGHT-END'`);
  const loss = await repo.list(viewer, { search: "MIDNIGHT-END", kind: "order" });
  assert.equal(loss.total, 1); assert.equal(loss.summary.missingSales, 0);
  assert.equal(Number(loss.summary.sale), 0); assert.equal(Number(loss.summary.cost), 1.01);
  assert.equal(Number(loss.summary.profit), -1.01); assert.equal(loss.entries[0].figures.profit, "-1.01");
  await assert.rejects(repo.list(viewer, { kind: "invalid" }), { status: 400 });
  console.log("PASS: setup, fixed boundary, replay, late completion, exact cents, deposit retry, audit, search running balances, permissions, source deletion, rollback, negative balance");
} finally { await db.close(); }
