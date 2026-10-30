// Debit page: isolated PGlite ledger and a fake bot database only.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { parseDebitPaste, debitBatchInput, accountInput } from "../src/lib/inventory-ledger.js";
import { createInventoryLedger } from "../src/server/inventory-ledger.js";
import { createOrderLookup } from "../src/server/inventory-order-lookup.js";
import { importRowsFromCsv, parseCsv } from "../scripts/lib/inventory-ledger-import.mjs";

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`); }
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rejects = (p, status, re) => assert.rejects(p, e => { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return true; });

await check("paste: tab or space separated, thousands and currency text removed, blank lines skipped", () => {
  assert.deepEqual(parseDebitPaste("K1\t1,000\tINV-1\r\n\n#307174  249203\nK2\tKs5,000\n"), [
    { orderRef: "K1", amount: "1000", invoice: "INV-1" },
    { orderRef: "#307174", amount: "249203", invoice: "" },
    { orderRef: "K2", amount: "5000", invoice: "" },
  ]);
  assert.deepEqual(parseDebitPaste(""), []);
  assert.throws(() => debitBatchInput({ accountId: "1", rows: [] }), /ยังไม่มีรายการ/);
  assert.throws(() => debitBatchInput({ accountId: "", rows: [{}] }), /เลือกบัญชี/);
  assert.throws(() => debitBatchInput({ accountId: "1", rows: Array(201).fill({}) }), /200/);
});

await check("registry CSV: one account per workbook tab, closed tabs disabled, duplicates skipped", () => {
  const csv = "﻿\"ไฟล์\",\"แท็บ (บัญชี/ช่องทาง)\",\"สกุลเงิน (เดา)\",\"จำนวนแถวในแท็บ\",\"สถานะในชื่อแท็บ\"\r\n"
    + "\"1.2 UID ( MMK )_\",\"WAVEPAY 5 (76470)\",\"MMK\",\"1705\",\"\"\r\n"
    + "\"1.2 UID ( MMK )_\",\"OR RB 1-52057 ปิดใช้งาน\",\"MMK\",\"1150\",\"ปิดใช้งาน\"\r\n"
    + "\"2.1 STOCK_\",\"pes4\",\"\",\"1003\",\"\"\r\n\"2.2 ITUNES\",\"pes4\",\"\",\"1003\",\"\"\r\n\"2.2 ITUNES\",\"pes4\",\"\",\"1\",\"\"\r\n"
    + "\"1.7 UID ( USD )_\",\"say \"\"hi\"\", ok\",\"USD\",\"2\",\"\"\r\n";
  assert.equal(parseCsv(csv).at(-1)[1], 'say "hi", ok');
  const { accounts, skipped } = importRowsFromCsv(csv);
  assert.deepEqual(accounts.map(a => [a.provider, a.label, a.currency, a.status]), [
    ["wavepay", "WAVEPAY 5 (76470)", "MMK", "active"], ["channel", "OR RB 1-52057 ปิดใช้งาน", "MMK", "disabled"],
    ["channel", "pes4", "UNKNOWN", "active"], ["itunes", "pes4", "UNKNOWN", "active"], ["channel", 'say "hi", ok', "USD", "active"],
  ]);
  assert.equal(accounts[2].ref, "2.1 STOCK :: pes4", "same tab name in two workbooks stays two accounts");
  assert.deepEqual(skipped, ["ซ้ำ: 2.2 ITUNES :: pes4"]);
  for (const a of accounts) accountInput(a);
});

// ---------- order lookup against a fake bot database
const calls = [];
async function select(sql, params) {
  calls.push(sql);
  assert.doesNotMatch(sql, /login|password|uid|buyer/i, "no personal columns");
  if (sql.includes("FROM telegram_orders_dev WHERE order_id")) return [{ order_id: "K1", task_request_id: "kaleoz-K1", status: "pending", source: null, game_name: "WeSing", pack_name: "1045 Kcoin", price: "100" }].filter(r => params[0].includes(r.order_id));
  if (sql.includes("FROM telegram_orders_dev WHERE task_request_id")) return [{ order_id: "R9", task_request_id: "777001", status: "success", source: "russia", game_name: "PUBG", pack_name: "60 UC", price: "1" }].filter(r => params[0].includes(r.task_request_id));
  if (sql.includes("telegram_task_request_id = ANY")) return [
    { id: 11, task: "kaleoz-K1", status: "manual", payment_method: null, game_name: "WeSing", pack_name: "x", pack_price: null, manual_button: false, bot_status: null },
    { id: 12, task: "777001", status: "completed", payment_method: "U9", game_name: "PUBG", pack_name: "60 UC", pack_price: "Ks1,000", manual_button: false, bot_status: "completed" },
  ].filter(r => params[0].includes(r.task));
  if (sql.includes("c.id = ANY")) return [
    { id: 307174, task: null, status: "completed", payment_method: "WavePay", game_name: "LADS", pack_name: "6480", pack_price: "Ks249,203", manual_button: false, bot_status: "failed" },
  ].filter(r => params[0].includes(r.id));
  if (sql.includes("FROM kaleoz_orders")) return [{ order_id: "K1", game_name: "WeSing", pack: "1045", amount: "100", currency: "THB", status: "pending" },
    { order_id: "K404", game_name: "MLBB", pack: "86", amount: "50", currency: "THB", status: "failed" }].filter(r => params[0].includes(r.order_id));
  return [];
}

await check("lookup: telegram, queue, marketplace and queue ids; bot-completed only when the bot really paid", async () => {
  const out = await createOrderLookup({ select }).lookup(["K1", "777001", "#307174", "K404", "NOPE", " K1 ", ""]);
  assert.deepEqual(Object.keys(out).sort(), ["#307174", "777001", "K1", "K404", "NOPE"]);
  assert.deepEqual([out.K1.found, out.K1.where, out.K1.telegramStatus, out.K1.queue[0].status, out.K1.botCompleted], [true, ["telegram", "queue", "kaleoz"], "pending", "manual", false]);
  assert.deepEqual([out["777001"].where, out["777001"].botCompleted], [["telegram", "queue"], true], "a Russia task id finds its order");
  assert.deepEqual([out["#307174"].where, out["#307174"].botCompleted], [["queue"], false], "closed by a person after the bot failed");
  assert.deepEqual([out.K404.where, out.K404.marketplaceStatus], [["kaleoz"], "failed"], "never reached Telegram");
  assert.deepEqual([out.NOPE.found, out.NOPE.where], [false, []]);
  assert.deepEqual(await createOrderLookup({ select }).lookup([]), {});
});

// ---------- the ledger
const db = new PGlite();
try {
  const client = { query: (sql, params) => db.query(sql, params), release() {} };
  const pool = { query: client.query, connect: async () => client };
  let clock = new Date("2026-10-29T05:00:00Z"); // 12:00 Bangkok
  const ledger = createInventoryLedger(pool, { now: () => clock });
  const admin = { id: 1, username: "Admin", permissions: ["projectm.admin"] };
  const staff = { id: 30, username: "wonmai", displayName: "wonmai@inblackm.com", permissions: [] };
  const other = { id: 31, username: "gus", permissions: [] };
  let sim, closed;

  await check("accounts: registered with group and status; every signed-in account can list them", async () => {
    [sim, closed] = (await ledger.registerAccounts([
      { provider: "wavepay", ref: "1.2 UID ( MMK ) :: WAVEPAY 5 (76470)", label: "WAVEPAY 5 (76470)", currency: "MMK", category: "1.2 UID ( MMK )" },
      { provider: "channel", ref: "1.2 UID ( MMK ) :: OR RB 1", label: "OR RB 1", currency: "MMK", category: "1.2 UID ( MMK )", status: "disabled" },
    ], admin)).map(r => r.id);
    const list = await ledger.debitAccounts(staff);
    assert.deepEqual(list.map(a => [a.label, a.category, a.status]), [["OR RB 1", "1.2 UID ( MMK )", "disabled"], ["WAVEPAY 5 (76470)", "1.2 UID ( MMK )", "active"]]);
    await rejects(ledger.debitAccounts(null), 401);
    await rejects(ledger.registerAccounts([{ provider: "x1", ref: "y", label: "y", currency: "MMK" }], staff), 403, /Admin/);
  });

  const rows = [
    { requestId: uuid(1), orderRef: "K1", amount: "11000", invoice: "TXN-1" },
    { requestId: uuid(2), orderRef: "K2", amount: "abc" },
    { requestId: uuid(3), orderRef: "", amount: "5" },
    { requestId: uuid(4), orderRef: "K3", amount: "5500" },
  ];
  await check("debit batch: staff can save; bad rows come back with a reason; the good ones are kept", async () => {
    const r = await ledger.recordDebits({ accountId: sim, rows }, staff);
    assert.deepEqual([r.saved, r.failed], [2, 2]);
    assert.deepEqual(r.results.map(x => [x.index, x.ok]), [[0, true], [1, false], [2, false], [3, true]]);
    assert.match(r.results[1].error, /^ยอด/);
    assert.match(r.results[2].error, /เลขออเดอร์/);
    const again = await ledger.recordDebits({ accountId: sim, rows: [rows[0], rows[3]] }, staff);
    assert.deepEqual(again.results.map(x => x.replayed), [true, true], "a retried save records nothing twice");
    await rejects(ledger.recordDebits({ accountId: closed, rows: [{ requestId: uuid(5), orderRef: "K5", amount: "1" }] }, staff).then(x => { if (!x.results[0].ok) throw Object.assign(new Error(x.results[0].error), { status: x.results[0].status }); }), 409, /ปิดใช้งาน/);
    await rejects(ledger.recordDebits({ accountId: sim, rows }, null), 401);
    // staff can only debit, never deposit or adjust
    await rejects(ledger.recordEntry({ requestId: uuid(6), kind: "deposit", accountId: sim, amount: "1", note: "x" }, staff, { staff: true }), 403, /เฉพาะยอดที่ใช้/);
    await rejects(ledger.recordEntry({ requestId: uuid(7), kind: "deposit", accountId: sim, amount: "1", note: "x" }, staff), 403);
    assert.deepEqual([...await ledger.debitedOrderRefs(staff, ["K1", "K3", "K9"])].sort(), ["K1", "K3"]);
  });

  await check("history: newest first, invoice kept, mine filter, who may cancel what", async () => {
    const day = { from: "2026-10-28T17:00:00Z", to: "2026-10-29T17:00:00Z" };
    const mine = await ledger.listEntries(staff, { ...day, mine: true });
    assert.deepEqual(mine.entries.map(e => [e.orderRef, e.amount, e.invoice, e.recordedBy, e.canReverse]),
      [["K3", "5500.0000", null, "wonmai@inblackm.com", true], ["K1", "11000.0000", "TXN-1", "wonmai@inblackm.com", true]]);
    assert.equal((await ledger.listEntries(other, { ...day, mine: true })).entries.length, 0);
    const seenByOther = await ledger.listEntries(other, { ...day, accountId: sim });
    assert.deepEqual(seenByOther.entries.map(e => e.canReverse), [false, false], "someone else's debit cannot be cancelled by staff");
    assert.deepEqual((await ledger.listEntries(admin, day)).entries.map(e => e.canReverse), [true, true]);
    await rejects(ledger.listEntries(staff, { from: "x", to: "y" }), 400);
  });

  await check("cancel: own debit the same Bangkok day; not someone else's; not tomorrow; admin always", async () => {
    const [k3, k1] = (await ledger.listEntries(staff, { from: "2026-10-28T17:00:00Z", to: "2026-10-29T17:00:00Z" })).entries;
    await rejects(ledger.reverseEntry({ requestId: uuid(10), reversesEntryId: k3.id }, other), 403, /ของตัวเอง/);
    const undo = await ledger.reverseEntry({ requestId: uuid(11), reversesEntryId: k3.id }, staff);
    assert.equal(undo.replayed, false);
    await rejects(ledger.reverseEntry({ requestId: uuid(12), reversesEntryId: k3.id }, staff), 409, /ไปแล้ว/);
    clock = new Date("2026-10-29T18:00:00Z"); // 01:00 Bangkok, next day
    await rejects(ledger.reverseEntry({ requestId: uuid(13), reversesEntryId: k1.id }, staff), 403);
    const after = await ledger.listEntries(staff, { from: "2026-10-28T17:00:00Z", to: "2026-10-29T19:00:00Z", mine: true });
    const byRef = Object.fromEntries(after.entries.filter(e => e.kind === "use").map(e => [e.orderRef, e]));
    assert.equal(byRef.K3.reversedBy != null, true);
    assert.equal(byRef.K1.canReverse, false, "yesterday's own debit: ask an admin");
    assert.equal((await ledger.reverseEntry({ requestId: uuid(14), reversesEntryId: k1.id }, admin)).replayed, false);
    assert.deepEqual([...await ledger.debitedOrderRefs(staff, ["K1", "K3"])], [], "cancelled debits are not 'already debited'");
  });

  await check("summary: net use per account, cancelled debits cancel out", async () => {
    clock = new Date("2026-10-29T19:00:00Z");
    await ledger.recordDebits({ accountId: sim, rows: [{ requestId: uuid(20), orderRef: "K4", amount: "2000" }] }, other);
    const [s] = await ledger.debitSummary(staff, { from: "2026-10-28T17:00:00Z", to: "2026-10-30T17:00:00Z" });
    assert.deepEqual([s.label, s.uses, s.reversals, s.netUsed], ["WAVEPAY 5 (76470)", 3, 2, "2000.0000"]);
  });
} finally {
  await db.close();
}

console.log(`${passed} passed`);
