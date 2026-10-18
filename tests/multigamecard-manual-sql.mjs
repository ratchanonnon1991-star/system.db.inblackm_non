// Isolated PostgreSQL-compatible fixture only. Never connects to application databases.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createMgcManual } from "../src/server/multigamecard-manual.js";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const client = { query: (sql, params) => db.query(sql, params), release() {} };
const repo = createMgcManual({ query: client.query, connect: async () => client });
const actor = { id: 16, username: "Tester", permissions: ["projectm.admin"] }, viewer = { id: 17, permissions: ["projectm.claim"] };
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const filters = { bounds: { start: "2000-01-01T00:00:00Z", end: "2100-01-01T00:00:00Z" } };
try {
  await assert.rejects(repo.save({ action: "card" }, viewer), { status: 403 });
  const opening = { action: "card", requestId: uuid(1), serial: "TEST-SERIAL", owner: "Staff", amount: "100000", note: "verified opening", pin: "DO_NOT_STORE" };
  const first = await repo.save(opening, actor);
  assert.equal((await repo.save(opening, actor)).replayed, true);
  await assert.rejects(repo.save({ ...opening, amount: "200000" }, actor), { status: 409 });
  await assert.rejects(repo.save({ ...opening, requestId: uuid(2) }, actor), { status: 409 });
  let data = await repo.read(viewer, filters);
  const id = data.cards[0].id;
  assert.equal(data.entries.length, 1); assert.equal(data.cards[0].balance, "100000.00");
  assert.ok(!JSON.stringify(data).includes("DO_NOT_STORE"));
  const debit = { action: "use", requestId: uuid(3), cardId: id, amount: "50001", orderId: "K1", saleThb: "50", costThb: "30", note: "real usage", invoice: "TX1" };
  await repo.save(debit, actor); await repo.save(debit, actor);
  data = await repo.read(viewer, filters);
  assert.equal(data.entries.length, 2); assert.equal(data.cards[0].balance, "49999.00"); assert.equal(data.cards[0].status, "เศษ");
  assert.equal(data.entries.find(e => e.orderId === "K1").figures.profit, "20.00");
  await assert.rejects(repo.save({ ...debit, requestId: uuid(4), amount: "50000" }, actor), { status: 409 });
  assert.equal((await repo.read(viewer, filters)).cards[0].balance, "49999.00");
  await repo.save({ action: "deposit", requestId: uuid(5), cardId: id, amount: "1", note: "confirmed points" }, actor);
  assert.equal((await repo.read(viewer, filters)).cards[0].status, "ปกติ");
  await repo.save({ ...debit, requestId: uuid(6), amount: "50000", orderId: "K2", saleThb: "", costThb: "" }, actor);
  data = await repo.read(viewer, filters);
  assert.equal(data.cards[0].balance, "0.00"); assert.equal(data.cards[0].status, "หมดแล้ว");
  assert.equal(data.cards[0].inTotal, "100001.00"); assert.equal(data.cards[0].outTotal, "100001.00");
  const missing = data.entries.find(e => e.orderId === "K2"); assert.equal(missing.figures.cost, null); assert.equal(missing.figures.profit, null);
  assert.ok(first.id);
  await assert.rejects(repo.read({ id: 1, permissions: [] }, filters), { status: 403 });
  // Insert failure rolls back the card's balance update as well.
  await db.exec("ALTER TABLE gamedb_mgc_entries ADD CONSTRAINT test_fail CHECK(order_label <> 'FAIL') NOT VALID");
  await repo.save({ action: "deposit", requestId: uuid(7), cardId: id, amount: "100", note: "confirmed" }, actor);
  await assert.rejects(repo.save({ ...debit, requestId: uuid(8), orderId: "FAIL", amount: "5" }, actor));
  assert.equal((await repo.read(viewer, filters)).cards[0].balance, "100.00");
  console.log("PASS: manual card creation, immutable entries, scoped permissions, idempotency, duplicate serial, overdraft, exact totals, zero/missing and SQL rollback");
} finally { await db.close(); }
