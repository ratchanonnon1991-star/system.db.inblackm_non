// Isolated PGlite fixture only. Never connects to application databases.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  toUnits, fromUnits, accountInput, entryInput, snapshotInput, reconcile, costOfUse, profitThb,
} from "../src/lib/inventory-ledger.js";
import { createInventoryLedger } from "../src/server/inventory-ledger.js";

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`); }
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rejects = (promise, status, pattern) => assert.rejects(promise, e => {
  assert.equal(e.status, status, e.message);
  if (pattern) assert.match(e.message, pattern);
  return true;
});

await check("amounts are exact decimals; bad input is refused, not rounded", () => {
  assert.equal(toUnits("1,234.5"), 12345000n);
  assert.equal(fromUnits(-12345000n), "-1234.5000");
  for (const bad of ["", "-1", "1e3", "0.00001", "abc", null]) assert.throws(() => toUnits(bad), { status: 400 });
  assert.throws(() => toUnits("0"), { status: 400 });
  assert.equal(toUnits("0", { allowZero: true }), 0n);
});

await check("input rules: use needs an order, reversal needs a target, every row needs a note", () => {
  const base = { requestId: uuid(1), accountId: "1", amount: "5", note: "x" };
  assert.throws(() => entryInput({ ...base, kind: "use" }), /เลขออเดอร์/);
  assert.throws(() => entryInput({ ...base, kind: "deposit", note: " " }), /หมายเหตุ/);
  assert.throws(() => entryInput({ ...base, kind: "nope" }), /ประเภท/);
  assert.throws(() => entryInput({ ...base, kind: "deposit", requestId: "not-a-uuid" }), /รหัสคำขอ/);
  assert.throws(() => entryInput({ requestId: uuid(1), kind: "reversal", note: "x" }), /กลับรายการ/);
  assert.throws(() => entryInput({ ...base, kind: "use", orderRef: "K1", thbAmount: "1.005" }), /2 ตำแหน่ง/);
  // a blank cost stays unknown instead of becoming zero
  assert.equal(entryInput({ ...base, kind: "use", orderRef: "K1", thbAmount: "" }).thbAmount, null);
  assert.equal(entryInput({ ...base, kind: "deposit", saleThb: "9" }).saleThb, null);
  assert.throws(() => accountInput({ provider: "razer", ref: "a", label: "A", currency: "MYR", costMethod: "fifo" }), /วิธีคิดต้นทุน/);
  assert.throws(() => accountInput({ provider: "Razer!", ref: "a", label: "A", currency: "MYR" }), /ผู้ให้บริการ/);
  assert.equal(accountInput({ provider: "WavePay", ref: "09x", label: "W", currency: "mmk" }).key, "wavepay:09x");
  assert.throws(() => snapshotInput({ accountId: "1", balance: "1", observedAt: "never" }), /เวลา/);
});

await check("costs: entered cost wins, then the account's method; unknown is null", () => {
  assert.deepEqual(costOfUse({ amount: "10", thbAmount: "99.00" }, { referenceRateThb: "1" }), { thb: "99.00", basis: "entered" });
  // IDR-sized rate keeps its precision: 150,000 × 0.00213 = 319.50
  assert.deepEqual(costOfUse({ amount: "150000" }, { referenceRateThb: "0.00213" }), { thb: "319.50", basis: "reference" });
  assert.deepEqual(costOfUse({ amount: "10" }, { costMethod: "deposit_average" }, { amount: "30", thb: "100" }), { thb: "33.33", basis: "deposit_average" });
  assert.deepEqual(costOfUse({ amount: "10" }, { costMethod: "deposit_average" }, null), { thb: null, basis: null });
  assert.deepEqual(costOfUse({ amount: "10" }, { referenceRateThb: null }), { thb: null, basis: null });
  assert.equal(profitThb("50.00", "30.25"), "19.75");
  assert.equal(profitThb("10", "12"), "-2.00");
  assert.equal(profitThb(null, "1"), null);
});

await check("reconcile: explained change matches, the rest is unexplained per window", () => {
  const result = reconcile({
    snapshots: [
      { balance: "100", observedAt: "2026-10-01T00:00:00Z" },
      { balance: "70", observedAt: "2026-10-02T00:00:00Z" },
      { balance: "60", observedAt: "2026-10-03T00:00:00Z" },
    ],
    movements: [
      { source: "bot", occurredAt: "2026-10-01T05:00:00Z", effect: -20n * 10000n, ref: "K1" },
      { source: "manual_use", occurredAt: "2026-10-01T06:00:00Z", effect: -10n * 10000n, ref: "K2" },
      // exactly on a snapshot belongs to the window that ends there
      { source: "deposit", occurredAt: "2026-10-02T00:00:00Z", effect: 0n },
      { source: "bot", occurredAt: "2026-10-02T09:00:00Z", effect: -5n * 10000n, ref: "K3" },
      { source: "manual_use", occurredAt: "2026-10-02T10:00:00Z", effect: -1n * 10000n, ref: "K3" },
      { source: "bot", occurredAt: "2026-10-04T00:00:00Z", effect: -7n * 10000n, ref: "K4" },
    ],
  });
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0].status, "match");
  assert.deepEqual(result.segments[0].bySource, { bot: "-20.0000", manual_use: "-10.0000", deposit: "0.0000" });
  assert.equal(result.segments[1].expectedBalance, "64.0000");
  assert.equal(result.segments[1].unexplained, "-4.0000");
  assert.equal(result.segments[1].status, "mismatch");
  assert.equal(result.mismatches, 1);
  assert.deepEqual(result.doubleCounted, ["K3"]);
  assert.equal(result.pendingSinceLastSnapshot, "-7.0000");
  assert.equal(result.estimatedBalance, "53.0000");
  const tolerant = reconcile({ snapshots: [{ balance: "10", observedAt: "2026-10-01T00:00:00Z" }, { balance: "9.99", observedAt: "2026-10-02T00:00:00Z" }], movements: [], tolerance: "0.01" });
  assert.equal(tolerant.segments[0].status, "match");
  assert.throws(() => reconcile({ snapshots: [], movements: [{ source: "bot", occurredAt: "bad", effect: 0n }] }), /เวลา/);
});

const db = new PGlite();
const client = { query: (sql, params) => db.query(sql, params), release() {} };
// pg returns NUMERIC as text and rows in `rows`; PGlite already does.
const pool = { query: client.query, connect: async () => client };
let clock = new Date("2026-10-10T12:00:00Z");
const ledger = createInventoryLedger(pool, { now: () => clock });
const admin = { id: 16, username: "Admin", permissions: ["projectm.admin"] };
const viewer = { id: 17, username: "Viewer", permissions: ["projectm.claim"] };
const nobody = { id: 18, permissions: [] };

try {
  let razer, mgc, idr;
  await check("permissions: view needs projectm.claim, writing needs projectm.admin", async () => {
    await rejects(ledger.listAccounts(nobody), 403);
    await rejects(ledger.registerAccounts([{ provider: "razer", ref: "x", label: "x", currency: "MYR" }], viewer), 403);
    await rejects(ledger.recordEntry({}, viewer), 403);
    await rejects(ledger.recordSnapshot({}, viewer), 403);
    assert.deepEqual(await ledger.listAccounts(viewer), []);
  });

  await check("registry: one row per key, re-registering is a no-op, a currency clash is refused", async () => {
    const created = await ledger.registerAccounts([
      { provider: "razer", ref: "9c69fa21", label: "Razer MY 1", currency: "MYR", referenceRateThb: "7.5" },
      { provider: "mgc", ref: "SERIAL-1", label: "MGC card 1", currency: "POINTS", costMethod: "deposit_average" },
      { provider: "donshop", ref: "main", label: "DonShop", currency: "IDR", referenceRateThb: "0.00213" },
    ], admin);
    assert.deepEqual(created.map(r => r.created), [true, true, true]);
    [razer, mgc, idr] = created.map(r => r.id);
    const again = await ledger.registerAccounts([{ provider: "razer", ref: "9c69fa21", label: "renamed", currency: "MYR" }], admin);
    assert.deepEqual(again, [{ id: razer, key: "razer:9c69fa21", created: false }]);
    await rejects(ledger.registerAccounts([{ provider: "razer", ref: "9c69fa21", label: "x", currency: "SGD" }], admin), 409, /MYR/);
    const list = await ledger.listAccounts(viewer);
    assert.equal(list.length, 3);
    assert.equal(list.find(a => a.id === razer).label, "Razer MY 1");
  });

  await check("snapshots: opening balance, idempotent retry, no conflicting duplicate, no future", async () => {
    const opening = { requestId: uuid(100), accountId: razer, balance: "100", observedAt: "2026-10-09T00:00:00Z" };
    const first = await ledger.recordSnapshot(opening, admin);
    assert.deepEqual(await ledger.recordSnapshot(opening, admin), { id: first.id, replayed: true });
    await rejects(ledger.recordSnapshot({ ...opening, balance: "101" }, admin), 409);
    await rejects(ledger.recordSnapshot({ ...opening, requestId: uuid(101), balance: "101" }, admin), 409);
    await rejects(ledger.recordSnapshot({ ...opening, requestId: uuid(102), observedAt: "2026-10-11T00:00:00Z" }, admin), 400, /อนาคต/);
    await rejects(ledger.recordSnapshot({ ...opening, requestId: uuid(103), accountId: "999" }, admin), 404);
    // provider sync dedupes on its timestamp
    const api = { accountId: idr, balance: "500000", observedAt: "2026-10-09T00:00:00Z" };
    const a = await ledger.recordProviderSnapshot(api);
    assert.deepEqual(await ledger.recordProviderSnapshot(api), { id: a.id, replayed: true });
  });

  let use1;
  await check("entries: idempotent by request id, bound to the same body and actor", async () => {
    const use = { requestId: uuid(1), kind: "use", accountId: razer, amount: "30", orderRef: "K100", saleThb: "300", note: "เติมมือ", occurredAt: "2026-10-09T08:00:00Z" };
    use1 = await ledger.recordEntry(use, admin);
    assert.deepEqual(await ledger.recordEntry(use, admin), { id: use1.id, replayed: true });
    await rejects(ledger.recordEntry({ ...use, amount: "31" }, admin), 409, /รหัสคำขอ/);
    await rejects(ledger.recordEntry(use, { ...admin, id: 99 }), 409, /รหัสคำขอ/);
  });

  await check("entries: spending past latest snapshot + recorded movements is refused", async () => {
    // 100 opening - 30 = 70 at most
    await rejects(ledger.recordEntry({ requestId: uuid(2), kind: "use", accountId: razer, amount: "70.0001", orderRef: "K101", note: "x" }, admin), 409, /70\.0000/);
    await ledger.recordEntry({ requestId: uuid(3), kind: "adjust_out", accountId: razer, amount: "70", note: "ทดสอบเต็มยอด" }, admin);
    await rejects(ledger.recordEntry({ requestId: uuid(4), kind: "adjust_out", accountId: razer, amount: "0.0001", note: "x" }, admin), 409);
    await ledger.recordEntry({ requestId: uuid(5), kind: "deposit", accountId: razer, amount: "50", thbAmount: "380", note: "โอนเติม" }, admin);
    // no snapshot yet on the MGC card: nothing to check against, so it is accepted
    await ledger.recordEntry({ requestId: uuid(6), kind: "use", accountId: mgc, amount: "10", orderRef: "OX1", note: "x" }, admin);
  });

  await check("entries: time bounds and inactive or missing accounts", async () => {
    await rejects(ledger.recordEntry({ requestId: uuid(7), kind: "deposit", accountId: razer, amount: "1", note: "x", occurredAt: "2026-10-11T00:00:00Z" }, admin), 400, /อนาคต/);
    await rejects(ledger.recordEntry({ requestId: uuid(8), kind: "deposit", accountId: razer, amount: "1", note: "x", occurredAt: "2026-08-01T00:00:00Z" }, admin), 400, /ย้อนหลัง/);
    await rejects(ledger.recordEntry({ requestId: uuid(9), kind: "deposit", accountId: "999", amount: "1", note: "x" }, admin), 404);
    await db.query("UPDATE gamedb_inv_accounts SET status='disabled' WHERE id=$1", [idr]);
    await rejects(ledger.recordEntry({ requestId: uuid(10), kind: "deposit", accountId: idr, amount: "1", note: "x" }, admin), 409, /ปิดใช้งาน/);
    await db.query("UPDATE gamedb_inv_accounts SET status='active' WHERE id=$1", [idr]);
  });

  await check("importEntries: admin-only old sheet rows, past the backdate limit and today's balance bound", async () => {
    const [{ id: old }] = await ledger.registerAccounts([{ provider: "razer", ref: "SGD:old@x.com", label: "old@x.com", currency: "SGD" }], admin);
    await ledger.recordSnapshot({ requestId: uuid(40), accountId: old, balance: "1", observedAt: "2026-10-09T00:00:00Z" }, admin);
    const row = { requestId: uuid(41), kind: "use", accountId: old, amount: "5", orderRef: "Q1", note: "ชีต", occurredAt: "2026-02-01T05:00:00Z" };
    const out = await ledger.importEntries([row, { ...row, requestId: uuid(42), amount: "-1" }], admin);
    assert.deepEqual(out.map(r => r.ok), [true, false]);
    assert.equal((await ledger.importEntries([row], admin))[0].replayed, true);
    await rejects(ledger.importEntries([{ ...row, requestId: uuid(43) }], viewer), 403);
    // the normal path still refuses the same row
    await rejects(ledger.recordEntry({ ...row, requestId: uuid(44) }, admin), 400, /ย้อนหลัง/);
    // a closed account keeps its old history; new movements are still refused
    const [{ id: closed }] = await ledger.registerAccounts([{ provider: "channel", ref: "closed-tab", label: "ปิดแล้ว", currency: "PHP", status: "disabled" }], admin);
    assert.equal((await ledger.importEntries([{ ...row, requestId: uuid(45), accountId: closed }], admin))[0].ok, true);
    await rejects(ledger.recordEntry({ ...row, requestId: uuid(46), accountId: closed, occurredAt: undefined }, admin), 409, /ปิดใช้งาน/);
  });

  await check("history is append-only: no update, delete or truncate", async () => {
    for (const sql of ["UPDATE gamedb_inv_entries SET amount=1", "DELETE FROM gamedb_inv_entries", "TRUNCATE gamedb_inv_entries",
      "UPDATE gamedb_inv_snapshots SET balance=1", "DELETE FROM gamedb_inv_snapshots"]) {
      await assert.rejects(db.query(sql), /append-only/, sql);
    }
  });

  await check("reversal: undoes once, copies the amount, cannot be reversed itself", async () => {
    const rev = await ledger.recordEntry({ requestId: uuid(20), kind: "reversal", reversesEntryId: use1.id, note: "ลูกค้ายกเลิก" }, admin);
    await rejects(ledger.recordEntry({ requestId: uuid(21), kind: "reversal", reversesEntryId: use1.id, note: "x" }, admin), 409, /ไปแล้ว/);
    await rejects(ledger.recordEntry({ requestId: uuid(22), kind: "reversal", reversesEntryId: rev.id, note: "x" }, admin), 409, /ซ้อน/);
    await rejects(ledger.recordEntry({ requestId: uuid(23), kind: "reversal", reversesEntryId: "999", note: "x" }, admin), 404);
    const row = (await db.query("SELECT direction, amount::text, order_ref FROM gamedb_inv_entries WHERE id=$1", [rev.id])).rows[0];
    assert.deepEqual(row, { direction: 1, amount: "30.0000", order_ref: "K100" });
    // 100 - 30 - 70 + 50 + 30 back
    const account = (await ledger.listAccounts(viewer)).find(a => a.id === razer);
    assert.equal(account.snapshotBalance, "100.0000");
    assert.equal(account.movedSinceSnapshot, "-20.0000");
  });

  await check("reconcileAccount: bot spending from outside + ledger vs snapshots", async () => {
    clock = new Date("2026-10-12T12:00:00Z");
    // 100 at 10-09 → bot spent 15, ledger moved -20 → expected 65; actual 60
    await ledger.recordSnapshot({ requestId: uuid(110), accountId: razer, balance: "60", observedAt: "2026-10-11T00:00:00Z" }, admin);
    const result = await ledger.reconcileAccount(viewer, razer, {
      from: "2026-10-10T00:00:00Z", to: "2026-10-12T00:00:00Z",
      botMovements: [{ occurredAt: "2026-10-10T03:00:00Z", amount: "15", ref: "K200" }],
    });
    assert.equal(result.segments.length, 1, "anchored on the snapshot before the window");
    const seg = result.segments[0];
    assert.equal(seg.openingBalance, "100.0000");
    assert.equal(seg.expectedBalance, "65.0000");
    assert.equal(seg.unexplained, "-5.0000");
    assert.equal(seg.status, "mismatch");
    assert.deepEqual(seg.bySource, { manual_use: "-30.0000", adjust: "-70.0000", deposit: "50.0000", reversal: "30.0000", bot: "-15.0000" });
    await rejects(ledger.reconcileAccount(viewer, razer, { from: "2026-10-12", to: "2026-10-11" }), 400);
    await rejects(ledger.reconcileAccount(nobody, razer, { from: "2026-10-10", to: "2026-10-12" }), 403);
  });

  await check("orderCosts: reference rate, deposit average, entered cost, reversed flag", async () => {
    // MGC card: priced deposits 1000 pts for 300 THB, then 1000 for 500 THB
    await ledger.recordEntry({ requestId: uuid(30), kind: "deposit", accountId: mgc, amount: "1000", thbAmount: "300", note: "ซื้อบัตร", occurredAt: "2026-10-11T01:00:00Z" }, admin);
    await ledger.recordEntry({ requestId: uuid(31), kind: "use", accountId: mgc, amount: "100", orderRef: "OX2", saleThb: "50", note: "x", occurredAt: "2026-10-11T02:00:00Z" }, admin);
    await ledger.recordEntry({ requestId: uuid(32), kind: "deposit", accountId: mgc, amount: "1000", thbAmount: "500", note: "ซื้อบัตร", occurredAt: "2026-10-11T03:00:00Z" }, admin);
    await ledger.recordEntry({ requestId: uuid(33), kind: "use", accountId: mgc, amount: "100", orderRef: "OX3", note: "x", occurredAt: "2026-10-11T04:00:00Z" }, admin);
    await ledger.recordEntry({ requestId: uuid(34), kind: "use", accountId: idr, amount: "150000", orderRef: "DS1", saleThb: "400", note: "x", occurredAt: "2026-10-11T05:00:00Z" }, admin);
    await ledger.recordEntry({ requestId: uuid(35), kind: "use", accountId: idr, amount: "1000", orderRef: "DS2", thbAmount: "5.00", note: "ราคาจริงจากใบเสร็จ", occurredAt: "2026-10-11T06:00:00Z" }, admin);
    const orders = await ledger.orderCosts(viewer, { from: "2026-10-09T00:00:00Z", to: "2026-10-12T00:00:00Z" });
    const by = Object.fromEntries(orders.map(o => [o.orderRef, o]));
    assert.equal(by.K100.reversed, true);
    assert.equal(by.K100.costThb, "225.00"); assert.equal(by.K100.costBasis, "reference");
    assert.equal(by.OX1.costThb, null, "used before any priced deposit");
    assert.deepEqual([by.OX2.costThb, by.OX2.costBasis, by.OX2.profitThb], ["30.00", "deposit_average", "20.00"]);
    assert.equal(by.OX3.costThb, "40.00", "average moves with the second lot");
    assert.deepEqual([by.DS1.costThb, by.DS1.profitThb], ["319.50", "80.50"]);
    assert.deepEqual([by.DS2.costThb, by.DS2.costBasis, by.DS2.profitThb], ["5.00", "entered", null]);
    const later = await ledger.orderCosts(viewer, { from: "2026-10-11T03:30:00Z", to: "2026-10-12T00:00:00Z" });
    assert.equal(later.find(o => o.orderRef === "OX3").costThb, "40.00", "earlier deposits still count");
    assert.ok(!later.some(o => o.orderRef === "OX2"));
  });

  await check("adjust balance: any staff, reason required, kept as history, becomes the shown balance", async () => {
    clock = new Date("2026-10-20T00:00:00Z");
    const body = { accountId: idr, balance: "500", reason: "  นับยอดจริงในแอป ", previousBalance: "12.5", requestId: uuid(900) };
    await rejects(ledger.adjustBalance(body, {}), 401);
    await rejects(ledger.adjustBalance({ ...body, reason: " " }, nobody), 400, /เหตุผล/);
    await rejects(ledger.adjustBalance({ ...body, balance: "-1" }, nobody), 400);
    const first = await ledger.adjustBalance(body, nobody);
    clock = new Date("2026-10-20T00:00:05Z"); // a retry arrives later: still the same entry
    assert.deepEqual(await ledger.adjustBalance(body, nobody), { id: first.id, replayed: true });
    await rejects(ledger.adjustBalance({ ...body, balance: "501" }, nobody), 409);
    await ledger.adjustBalance({ ...body, balance: "480", previousBalance: "", reason: "หักค่าธรรมเนียม", requestId: uuid(901) }, admin);
    const history = await ledger.balanceAdjustments(nobody, idr);
    assert.deepEqual(history.map(h => [h.balance, h.previousBalance, h.note]),
      [["480.0000", null, "หักค่าธรรมเนียม"], ["500.0000", "12.5000", "นับยอดจริงในแอป"]]);
    assert.equal(history[1].at, "2026-10-20T00:00:00.000Z");
    assert.equal((await ledger.reservations(nobody)).find(a => a.id === idr).balance, "480.0000");
    await rejects(ledger.balanceAdjustments(nobody, "x"), 400);
  });

  await check("schema setup is safe to run again", async () => {
    const again = createInventoryLedger(pool, { now: () => clock });
    assert.equal((await again.listAccounts(viewer)).length, 5);
  });
} finally {
  await db.close();
}

console.log(`${passed} passed`);
