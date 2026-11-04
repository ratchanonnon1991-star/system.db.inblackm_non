// Isolated PGlite fixture only. Never connects to application databases.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createInventoryLedger } from "../src/server/inventory-ledger.js";
import { runChannelBridge } from "../src/server/inventory-channel-bridge.js";
import { verifyBridgeRequest, bridgeSignature } from "../src/server/itune-order-bridge-auth.js";
import { entryInput } from "../src/lib/inventory-ledger.js";

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`); }
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rejects = (promise, status, pattern) => assert.rejects(promise, (e) => {
  assert.equal(e.status, status, e.message);
  if (pattern) assert.match(e.message, pattern);
  return true;
});

const db = new PGlite();
const client = { query: (sql, params) => db.query(sql, params), release() {} };
const pool = { query: client.query, connect: async () => client };
const clock = new Date("2026-11-04T05:00:00Z");
const ledger = createInventoryLedger(pool, { now: () => clock });
const admin = { id: 1, username: "Admin", permissions: ["projectm.admin"] };
const rin = { id: 2, username: "RIN", permissions: ["projectm.claim"] };
const gus = { id: 3, username: "Gus", permissions: ["projectm.claim"] };
const staff = { "ext-2": rin, "ext-3": gus };
const resolveActor = async (id) => { if (!staff[id]) throw Object.assign(new Error("ยังไม่ได้จับคู่"), { status: 403 }); return staff[id]; };
const bridge = (body) => runChannelBridge(body, { ledger, resolveActor });
const order = (extra = {}) => ({ source: "kaleoz", ref: "K-1001", canRecord: true, ...extra });

try {
  const [{ id: wave }, { id: itune }, { id: closed }] = await ledger.registerAccounts([
    { provider: "wavepay", ref: "1.2 UID ( MMK ) :: WAVEPAY 3 (80888)", label: "WAVEPAY 3 (80888)", currency: "MMK", category: "1.2 UID ( MMK )" },
    { provider: "itunes", ref: "2.2 ITUNES :: ITUNES(USD) ปกติ", label: "ITUNES(USD) ปกติ", currency: "USD", category: "2.2 ITUNES" },
    { provider: "channel", ref: "old", label: "ปิดแล้ว", currency: "PHP", status: "disabled" },
  ], admin);

  await check("reserve: one holder, others see who; iTunes and closed accounts refused", async () => {
    assert.deepEqual(await ledger.reserve(wave, rin), { accountId: wave, reserved: true });
    assert.deepEqual(await ledger.reserve(wave, rin), { accountId: wave, reserved: true }, "reserving again is a no-op");
    await rejects(ledger.reserve(wave, gus), 409, /จองโดย RIN/);
    await rejects(ledger.reserve(itune, rin), 409, /iTunes/);
    await rejects(ledger.reserve(closed, rin), 409, /ปิดใช้งาน/);
    const list = await ledger.reservations(gus);
    assert.ok(!list.some((a) => a.id === itune), "iTunes accounts are not on the reservation page");
    const row = list.find((a) => a.id === wave);
    assert.deepEqual([row.holder, row.mine], ["RIN", false]);
  });

  await check("bridge list: the owner sees their held accounts; anyone sees the usage", async () => {
    const mine = await bridge({ action: "list", actorId: "ext-2", order: order() });
    assert.deepEqual(mine.held.map((a) => a.id), [wave]);
    const other = await bridge({ action: "list", actorId: "ext-3", order: order({ canRecord: false }) });
    assert.deepEqual([other.held, other.usage], [[], []]);
    await rejects(bridge({ action: "list", actorId: "ext-9", order: order() }), 403);
    await rejects(bridge({ action: "list", actorId: "ext-2", order: { ...order(), source: "unknown" } }), 400);
  });

  let used;
  await check("bridge use: as the mapped staff, only on their reserved account, retry replays once", async () => {
    const use = { action: "use", actorId: "ext-2", order: order(), payload: { id: uuid(1), accountId: wave, amount: "5000" } };
    used = await bridge(use);
    assert.equal(used.replayed, false);
    assert.deepEqual(used.usage.map((u) => [u.amount, u.recordedBy, u.orderRef]), [["5000.0000", "RIN", "K-1001"]]);
    assert.equal((await bridge(use)).replayed, true, "the same request id records once");
    assert.ok((await ledger.debitedOrderRefs(gus, ["K-1001"])).has("K-1001"), "the debit page warns this order is already recorded");
    await rejects(bridge({ ...use, order: order({ canRecord: false }), payload: { ...use.payload, id: uuid(2) } }), 403, /รับงาน/);
    await rejects(bridge({ ...use, actorId: "ext-3", payload: { ...use.payload, id: uuid(3) } }), 409, /ไม่ได้จองไว้กับคุณ/);
    await rejects(bridge({ ...use, payload: { ...use.payload, id: "not-a-uuid" } }), 400);
  });

  await check("usage is per order and source: the same number on another marketplace is another order", async () => {
    const g2g = await bridge({ action: "list", actorId: "ext-3", order: order({ source: "g2g", canRecord: false }) });
    assert.equal(g2g.usage.length, 0);
    const seen = await bridge({ action: "list", actorId: "ext-3", order: order({ canRecord: false }) });
    assert.equal(seen.usage.length, 1, "another staff member sees the use");
  });

  await check("reverse: own use of this order, even after releasing the account; not someone else's", async () => {
    await rejects(bridge({ action: "reverse", actorId: "ext-3", order: order(), payload: { id: uuid(10), entryId: used.id } }), 403);
    await ledger.release(wave, rin);
    const undone = await bridge({ action: "reverse", actorId: "ext-2", order: order(), payload: { id: uuid(11), entryId: used.id } });
    assert.equal(undone.usage[0].cancelled, true);
    await rejects(bridge({ action: "reverse", actorId: "ext-2", order: order({ ref: "OTHER" }), payload: { id: uuid(12), entryId: used.id } }), 404);
  });

  await check("release: holder or admin only", async () => {
    await ledger.reserve(wave, gus);
    await rejects(ledger.release(wave, rin), 409);
    assert.deepEqual(await ledger.release(wave, admin), { accountId: wave, reserved: false });
  });

  await check("order source leaves older requests' hashes alone", () => {
    const base = { requestId: uuid(20), kind: "use", accountId: "1", amount: "1", orderRef: "Q", note: "n" };
    assert.ok(!("orderSource" in entryInput(base)));
    assert.equal(entryInput({ ...base, orderSource: "Russia" }).orderSource, "russia");
    assert.throws(() => entryInput({ ...base, orderSource: "bad source!" }), /ช่องทาง/);
  });

  await check("bridge signature: the channels prefix does not verify as another endpoint", () => {
    const secret = "s".repeat(40), raw = JSON.stringify({ action: "list" }), timestamp = String(clock.getTime());
    const headers = (sig) => new Headers({ "x-itune-timestamp": timestamp, "x-itune-signature": sig });
    verifyBridgeRequest(headers(bridgeSignature(secret, timestamp, `channels\n${raw}`)), `channels\n${raw}`, secret, clock.getTime());
    assert.throws(() => verifyBridgeRequest(headers(bridgeSignature(secret, timestamp, raw)), `channels\n${raw}`, secret, clock.getTime()), { status: 401 });
  });
} finally {
  await db.close();
}
console.log(`${passed} passed`);
