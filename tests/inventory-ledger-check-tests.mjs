// Synthetic bot rows and an isolated PGlite ledger only. Never connects to application databases.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { receiptEvidence } from "../src/lib/inventory-ledger-receipts.js";
import { razerLedgerKey, receiptRef, groupWallets, razerWallet, razerReceipt, waveReceipt, plsbuyReceipts } from "../src/lib/inventory-ledger-sources.js";
import { createInventoryCheck } from "../src/server/inventory-ledger-check.js";
import { createInventoryLedger } from "../src/server/inventory-ledger.js";
import { dsWalletChecks } from "../src/lib/donshop-inventory.js";
import { checkText, checkJson, maskLabel } from "../scripts/lib/inventory-ledger-check-format.mjs";

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`); }

// 2026-10-20 Bangkok; times are UTC (10:00 BKK = 03:00Z).
const at = hhmm => `2026-10-20T${hhmm}:00Z`;
const day = { dateFrom: "2026-10-20", dateTo: "2026-10-20" };
const viewer = { id: 17, permissions: ["projectm.claim"] };
const admin = { id: 16, username: "Admin", permissions: ["projectm.admin"] };

// ---------- synthetic bot database
const razerRow = (id, extra) => ({ history_id: id, status: "completed", purchase_email: " A@Shop.com ", currency_code: "SGD",
  source_order_id: `K${id}:1`, source_base: `K${id}`, balance_received_at: null, completed_at: null, ...extra });
const razer = [
  razerRow(1, { occurred_at: at("03:00"), balance_received_at: at("03:01"), old_balance_gold: "100", deducted: "10", new_balance_gold: "90" }),
  // 04:00 someone used 5 by hand
  razerRow(2, { occurred_at: at("05:00"), completed_at: at("05:00"), old_balance_gold: "85", deducted: "20", new_balance_gold: "65" }),
  razerRow(3, { status: "failed", occurred_at: at("06:00"), old_balance_gold: "65", deducted: null, new_balance_gold: null }),
  // the bot's own numbers disagree: 60 - 10 should be 50, it says 52
  razerRow(4, { occurred_at: at("07:00"), balance_received_at: at("07:01"), old_balance_gold: "60", deducted: "10", new_balance_gold: "52" }),
  // 07:30 a top-up of 100 nobody recorded
  razerRow(5, { occurred_at: at("08:00"), balance_received_at: at("08:01"), old_balance_gold: "152", deducted: "2.004", new_balance_gold: "150" }),
  razerRow(6, { purchase_email: "b@shop.com", currency_code: "CAD", occurred_at: at("03:00"), old_balance_gold: "20", deducted: "5", new_balance_gold: "15" }),
  razerRow(7, { purchase_email: "", occurred_at: at("03:00"), old_balance_gold: "1", deducted: "1", new_balance_gold: "0" }),
];
const netease = [
  { history_id: 1, purchase_email: "neteasekrw@hotmail.com", currency: "KRW", old_balance: "50000", deducted: "10000", new_balance: "40000", occurred_at: at("03:00"), source_base: "N1" },
  { history_id: 2, purchase_email: "neteasekrw@hotmail.com", currency: "KRW", old_balance: "30000", deducted: "10000", new_balance: "20000", occurred_at: at("04:00"), source_base: "N2" },
  // Pay 2 and Credit 2 share this e-mail: balances of two wallets interleave
  { history_id: 3, purchase_email: "inblacknetease1@hotmail.com", currency: "USD", old_balance: "11.84", deducted: "1", new_balance: "10.84", occurred_at: at("03:00"), source_base: "N3" },
  { history_id: 4, purchase_email: "inblacknetease1@hotmail.com", currency: "USD", old_balance: "900.99", deducted: "1", new_balance: "899.99", occurred_at: at("03:30"), source_base: "N4" },
];
const wave = [
  { id: 11, status: "completed", phone_key: "0977000111", old_balance: "100000", new_balance: "90000", pack_price: "Ks10,000", occurred_at: at("03:00"), source_base: "W1" },
  { id: 12, status: "manual", phone_key: "0977000111", old_balance: null, new_balance: null, pack_price: "Ks5,000", occurred_at: at("03:30"), source_base: "W2" },
  { id: 13, status: "completed", phone_key: "0977000111", old_balance: "85000", new_balance: "80000", pack_price: "Ks5,000", occurred_at: at("04:00"), source_base: "W3" },
  // no balance read: pack price is the fallback debit, the chain continues through it
  { id: 14, status: "completed", phone_key: "0977000111", old_balance: null, new_balance: null, pack_price: "Ks2,000", occurred_at: at("05:00"), source_base: "W4" },
  { id: 15, status: "completed", phone_key: "0977000111", old_balance: "78000", new_balance: "77000", pack_price: "Ks1,000", occurred_at: at("06:00"), source_base: "W5" },
];
const shell = [
  { id: 21, status: "completed", garena_username: "InblackRB2c", shell_before: "1000", shell_used: "100", shell_after: "900", occurred_at: at("03:00"), source_base: "G1" },
  { id: 22, status: "completed", garena_username: "inblackrb2c", shell_before: "900", shell_used: "50", shell_after: "850", occurred_at: at("04:00"), source_base: "G2" },
  { id: 23, status: "completed", garena_username: "someone-else", shell_before: "5", shell_used: "1", shell_after: "4", occurred_at: at("04:00"), source_base: "G3" },
];
const gpRow = (id, before, submitted, amount) => ({ id, source_order_id: `P${id}:1`, source_base: `P${id}`, source: "itemku", occurred_at: submitted,
  balance_before: before, submitted_at: submitted, quantity: 1, plan_total: "1", plan_refs: null, lines: null, provider_amount: amount, ledger_slices: [] });
const gamepoint = [gpRow(31, "100", at("03:00"), "10"), gpRow(32, "85", at("04:00"), "5")];
const plsRow = (id, occurred, used, wallet) => ({ id, source_order_id: `L${id}:1`, source_base: `L${id}`, source: "itemku", occurred_at: occurred,
  myr_used: used, recorded_cost: null, ledger_slices: [{ id, used, typed: true }],
  ...(wallet ? { wallet_after: wallet.after, wallet_before: wallet.before, wallet_checked_at: wallet.at, wallet_currency: "MYR", wallet_source: "plsbuy_api" } : {}) });
const plsbuy = [
  plsRow(41, at("03:00"), "10", { before: "100", after: "90", at: at("03:00") }),
  plsRow(42, at("03:30"), "5", null),
  plsRow(43, at("04:00"), "5", { before: "85", after: "80", at: at("04:00") }),
];
const unfinishedRows = { GamePointClub: [{ id: 33, status: "failed", source_base: "P33", started_at: at("03:30") }], PlsbuyMYR: [] };
// Donshop: before-only reads, chained by when the bot took the queue (started_at), not creation.
const dsRow = (id, status, startedAt, before, cost, extra = {}) => ({ id, status, source_order_id: `D${id}:1`, source_base: `D${id}`,
  occurred_at: extra.created ?? startedAt, started_at: startedAt, balance_before: before, live_cost_total: cost, live_cost: null, quantity: "1", ...extra });
const donshop = [
  // created the evening before the range, taken by the bot inside it: still chained
  dsRow(60, "completed", at("02:00"), "1100000", "100000", { created: "2026-10-19T16:00:00Z" }),
  dsRow(61, "completed", at("03:00"), "1000000", "100000"),
  dsRow(62, "failed", at("03:30"), null, null, { live_cost: "50000", quantity: "1" }),
  dsRow(63, "completed", at("04:00"), "850000", "100000"),   // 50,000 gone = D62's quote: charged, not completed
  dsRow(64, "completed", at("05:00"), "750000", null),       // debit not logged: next window cannot be judged
  dsRow(65, "completed", at("06:00"), "600000", "10000"),
  dsRow(66, "completed", at("07:00"), "580000", "5000"),     // 10,000 gone ...
  dsRow(67, "completed", at("08:00"), "585000", "0"),        // ... and given back: refunded
];
const codashop = { WavePay: () => wave, GarenaShells: () => shell, DonShopIDR: () => donshop };

const page = (rows, cursorField, cursor, start, end) => rows
  .filter(r => Number(r[cursorField]) > Number(cursor) && r.occurred_at >= start && r.occurred_at < end)
  .sort((a, b) => a[cursorField] - b[cursorField]);
const seen = [];
async function select(sql, params) {
  seen.push(sql);
  assert.doesNotMatch(sql, /password|otp|cookie|session|token|provider_response(?!->|#>|\))/i, "explicit projections only");
  if (sql.includes("FROM razer_purchase_history")) return page(razer, "history_id", params[0], params[1], params[2]);
  if (sql.includes("FROM netease_purchase_history")) return page(netease, "history_id", params[0], params[1], params[2]);
  if (sql.includes("status <> 'completed'")) return unfinishedRows[params[0]] ?? [];
  if (sql.includes("DISTINCT ON")) return [];
  if (sql.includes("c.id = ANY($1::bigint[])")) {
    return [...gamepoint, ...plsbuy].filter(r => params[0].includes(String(r.id))).map(r => ({ id: r.id, started_at: r.occurred_at }));
  }
  if (sql.includes("c.payment_method = $4")) {
    assert.match(sql, /AT TIME ZONE current_setting\('TimeZone'\)/, "times are made exact in SQL");
    return page(codashop[params[3]](), "id", params[0], params[1], params[2]);
  }
  if (sql.includes("WITH selected_orders")) return page(gamepoint, "id", params[1], params[2], params[3]);
  if (sql.includes("ledger.myr_used")) return page(plsbuy, "id", params[1], params[2], params[3]);
  if (sql.includes("AS lot_count")) return [{ lot_count: 0, remaining: null, observed_at: null }];
  if (sql.includes("LIMIT 1")) return [];
  throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
}
const checker = createInventoryCheck({ select });
const run = (provider, extra = {}) => checker.check(viewer, { provider, ...day, ...extra });

// ---------- pure parts
await check("receipt chain: before/after balances and one bot spend each, same-second order kept", () => {
  const { wallets, unplaced } = groupWallets(razer, { wallet: razerWallet, receipt: razerReceipt });
  assert.equal(unplaced, 1);
  assert.deepEqual(wallets.map(w => w.key), ["razer:CAD:b@shop.com", "razer:SGD:a@shop.com"]);
  assert.equal(razerLedgerKey("A@Shop.com ", "sgd"), "razer:SGD:a@shop.com");
  const evidence = receiptEvidence(wallets[1].receipts, wallets[1].hints);
  assert.equal(evidence.snapshots.length, 8);
  assert.deepEqual(evidence.snapshots.slice(0, 2), [
    { balance: "100.0000", observedAt: "2026-10-20T03:00:00.000Z", tag: "ก่อนซื้อ K1" },
    { balance: "90.0000", observedAt: "2026-10-20T03:01:00.000Z", tag: "หลังซื้อ K1" },
  ]);
  assert.equal(evidence.snapshots[3].observedAt, "2026-10-20T05:00:00.001Z");
  assert.deepEqual(evidence.botMovements.map(m => m.amount), ["10.0000", "20.0000", "10.0000", "2.0000"]);
  assert.deepEqual(evidence.hints, [{ at: "2026-10-20T06:00:00.000Z", status: "failed", ref: "K3", amount: null }]);
  assert.deepEqual(evidence.problems, []);
  assert.equal(receiptRef({}, 9), "receipt-9");
});

await check("missing numbers, negative balances and overlapping purchases are reported, not guessed", () => {
  const evidence = receiptEvidence([
    { ref: "A", startAt: at("03:00"), endAt: at("03:10"), before: null, after: null, spent: null },
    { ref: "B", startAt: at("03:05"), before: "5", after: "9", spent: "x" },
    { ref: "C", startAt: at("04:00"), before: "-1", after: null, spent: "1" },
  ]);
  assert.deepEqual(evidence.problems.map(p => `${p.ref} ${p.problem}`), ["A ไม่ทราบยอดที่ตัด", "B ซื้อซ้อนเวลากับรายการก่อนหน้า", "B ไม่ทราบยอดที่ตัด", "C ยอดก่อนติดลบ"]);
  assert.equal(evidence.unobserved, 1);
  assert.deepEqual(evidence.botMovements.map(m => [m.ref, m.unknown ?? false]), [["A", true], ["B", true], ["C", false]]);
});

await check("WavePay pack price is only a fallback; Plsbuy fills without an API read are unobserved", () => {
  assert.equal(waveReceipt(wave[0]).spent, null);
  assert.equal(waveReceipt(wave[3]).spent, "2000.00");
  const receipts = plsbuyReceipts([{ fills: plsbuy.map(r => ({ orderId: r.source_base, occurredAt: r.occurred_at, used: r.myr_used,
    wallet: r.wallet_after ? { amount: r.wallet_after, before: r.wallet_before, checkedAt: r.wallet_checked_at } : null })) }]);
  assert.deepEqual(receipts.map(r => [r.ref, r.before, r.after]), [["L41", "100", "90"], ["L42", null, null], ["L43", "85", "80"]]);
  assert.ok(Date.parse(receipts[0].startAt) < Date.parse(receipts[0].endAt));
});

// ---------- each provider through its real loader
await check("Razer: hand use, a failed buy, a bad receipt and a top-up", async () => {
  const report = await run("razer");
  assert.equal(report.receipts, 7); assert.equal(report.unplacedReceipts, 1); assert.equal(report.walletsWithGaps, 1);
  const [a, b] = report.wallets;
  assert.equal(b.currency, "CAD"); assert.deepEqual(b.gaps, []);
  assert.deepEqual([a.receipts, a.botSpent, a.firstBalance, a.lastBalance], [4, "42.0000", "100.0000", "150.0000"]);
  assert.deepEqual(a.gaps.map(g => [g.kind, g.direction, g.amount, g.fromTag, g.toTag]), [
    ["between", "out", "5.0000", "หลังซื้อ K1", "ก่อนซื้อ K2"],
    ["between", "out", "5.0000", "หลังซื้อ K2", "ก่อนซื้อ K4"],
    ["receipt", "in", "2.0000", "ก่อนซื้อ K4", "หลังซื้อ K4"],
    ["between", "in", "100.0000", "หลังซื้อ K4", "ก่อนซื้อ K5"],
  ]);
  assert.deepEqual(a.gaps[1].hints.map(h => h.ref), ["K3"], "the failed buy sits in that gap");
  assert.deepEqual([a.unexplainedIn, a.unexplainedOut, a.receiptMismatches], ["100.0000", "10.0000", 1]);
});

await check("Netease: a named wallet is chained; a shared e-mail is refused, not guessed", async () => {
  const report = await run("netease");
  const krw = report.wallets.find(w => w.key === "netease:krw1");
  assert.equal(krw.label, "(KRW) Netease Pay 1");
  assert.deepEqual(krw.gaps.map(g => [g.direction, g.amount]), [["out", "10000.0000"]]);
  const shared = report.wallets.find(w => w.uncheckable);
  assert.match(shared.uncheckable, /Pay\/Credit/);
  assert.deepEqual([shared.receipts, shared.gaps.length, shared.firstBalance], [2, 0, null]);
});

await check("WavePay: per SIM, through a pack-price-only fill, failed order as a hint", async () => {
  const report = await run("wavepay");
  const [sim] = report.wallets;
  assert.equal(sim.key, "wavepay:0977000111");
  assert.equal(sim.receipts, 4); assert.equal(sim.unobserved, 1);
  assert.deepEqual(sim.gaps.map(g => [g.direction, g.amount, g.hints.map(h => `${h.status} ${h.ref}`)]), [["out", "5000.0000", ["manual W2"]]]);
  // W2 was not completed but its pack price is exactly what went missing
  assert.deepEqual([sim.gaps[0].likely, sim.gaps[0].suspects.map(h => h.ref), sim.charged], ["charged", ["W2"], 1]);
  assert.equal(sim.botSpent, "18000.0000");
  assert.match(report.note, /2026-10-15/);
});

await check("Garena Shell: inventory usernames only, case-insensitive", async () => {
  const report = await run("garena-shell");
  assert.equal(report.unplacedReceipts, 1);
  assert.deepEqual(report.wallets.map(w => [w.key, w.receipts, w.gaps.length, w.lastBalance]), [["garena-shell:inblackrb2c", 2, 0, "850.0000"]]);
});

await check("Gamepoint: before-only reads chain through the debit", async () => {
  const report = await run("gamepoint");
  const [wallet] = report.wallets;
  assert.equal(wallet.key, "gamepoint:MYR");
  assert.deepEqual(wallet.gaps.map(g => [g.direction, g.amount, g.fromTag, g.toTag, g.hints.map(h => h.ref)]),
    [["out", "5.0000", "ก่อนซื้อ P31", "ก่อนซื้อ P32", ["P33"]]]);
  assert.ok(!seen.some(s => /sale_rates|coingecko/i.test(s)));
});

await check("Plsbuy: API reads chain across a fill that has none", async () => {
  const report = await run("plsbuy");
  const [wallet] = report.wallets;
  assert.deepEqual([wallet.key, wallet.receipts, wallet.unobserved, wallet.gaps.length, wallet.botSpent], ["plsbuy:MYR", 3, 1, 0, "20.0000"]);
});

await check("Donshop: charged, unverifiable and refunded, same answer as the Donshop page", async () => {
  const report = await run("donshop");
  assert.equal(report.receipts, 7, "only rows created inside the range are counted");
  const [w] = report.wallets;
  assert.equal(w.key, "donshop:IDR");
  assert.deepEqual(w.gaps.map(g => [g.likely, g.amount, g.fromTag, g.toTag]), [
    ["charged", "50000.0000", "ก่อนซื้อ D61", "ก่อนซื้อ D63"],
    ["refunded", "10000.0000", "ก่อนซื้อ D65", "ก่อนซื้อ D66"],
  ]);
  assert.deepEqual(w.gaps[0].suspects.map(h => [h.ref, h.amount]), [["D62", "50000.0000"]]);
  assert.equal(w.gaps[1].refundedAt, "2026-10-20T08:00:00.000Z");
  assert.deepEqual([w.charged, w.refunded, w.unverifiable, w.unexplainedOut, w.unexplainedIn], [1, 1, 1, "50000.0000", "0.0000"]);
  assert.deepEqual(w.problems.map(p => `${p.ref} ${p.problem}`), ["D64 ไม่ทราบยอดที่ตัด"]);
  // The Donshop page's own checker on the same rows finds the same money.
  const page = dsWalletChecks([...donshop].sort((a, b) => a.started_at.localeCompare(b.started_at)))
    .filter(a => a.kind !== "evidence").map(a => [a.kind, a.amount]);
  assert.deepEqual(page, [["charged", "50000.00"], ["refunded", "10000.00"]]);
});

await check("a range with context rows hides gaps that ended before it", async () => {
  const report = await run("donshop", { dateFrom: "2026-10-21", dateTo: "2026-10-21" });
  assert.deepEqual(report.wallets.map(w => [w.receipts, w.gaps.length]), [[0, 0]]);
});

await check("input checks and filters", async () => {
  assert.equal((await run("razer", { account: "b@shop" })).wallets.length, 1);
  assert.equal((await run("razer", { dateFrom: "2026-10-21", dateTo: "2026-10-21" })).wallets.length, 0);
  assert.deepEqual((await run("razer", { tolerance: "5" })).wallets[0].gaps.map(g => g.amount), ["100.0000"]);
  await assert.rejects(checker.check({ id: 1, permissions: [] }, { provider: "razer", ...day }), { status: 403 });
  await assert.rejects(run("itune"), /ผู้ให้บริการ/);
  await assert.rejects(run("razer", { dateFrom: "2026-01-01" }), /93 วัน/);
  await assert.rejects(run("razer", { withLedger: true }), { status: 500 });
  assert.deepEqual(checker.providers.map(p => p.id), ["razer", "netease", "wavepay", "garena-shell", "gamepoint", "plsbuy", "donshop"]);
});

await check("script output masks e-mails and phones, and reads in Thai time", async () => {
  const text = checkText(await run("razer"));
  if (process.env.SHOW_SAMPLE) console.log(text);
  assert.ok(!text.includes("a@shop.com") && text.includes("a***@shop.com"));
  assert.match(text, /-\s+5\.00 {2}2026-10-20 10:01:00 → 2026-10-20 12:00:00 {2}ยอดหาย/);
  assert.match(text, /มีรายการสถานะ failed K3 เวลา 2026-10-20 13:00:00/);
  assert.match(text, /✓ ตรงทุกช่วงที่ตรวจได้/);
  assert.match(checkText(await run("netease")), /\? ตรวจไม่ได้: อีเมลนี้ใช้ร่วมกัน/);
  const wave = checkText(await run("wavepay"));
  assert.ok(!wave.includes("0977000111") && wave.includes("09*****111"));
  assert.match(wave, /1 ใบไม่มียอดก่อน\/หลัง/);
  const ds = checkText(await run("donshop"));
  if (process.env.SHOW_SAMPLE) console.log(ds);
  assert.match(ds, /คิวไม่สำเร็จแต่โดนหักเงิน: น่าจะเป็น D62/);
  assert.match(ds, /หักแล้วได้คืน/);
  assert.match(ds, /1 ช่วงตรวจไม่ได้/);
  const json = JSON.stringify(checkJson(await run("razer")));
  assert.ok(!json.includes("a@shop.com"));
  assert.ok(JSON.stringify(checkJson(await run("razer"), { fullLabel: true })).includes("razer:SGD:a@shop.com"));
  assert.equal(maskLabel("(KRW) Netease Pay 1"), "(KRW) Netease Pay 1");
});

// ---------- with the ledger
const db = new PGlite();
try {
  const client = { query: (sql, params) => db.query(sql, params), release() {} };
  const pool = { query: client.query, connect: async () => client };
  const ledger = createInventoryLedger(pool, { now: () => new Date("2026-10-21T00:00:00Z") });

  await check("with the ledger, recorded hand use and top-ups explain their gaps", async () => {
    let opened = 0;
    await run("razer"); // bot-only never opens the ledger
    const [account] = await ledger.registerAccounts([{ provider: "razer", ref: "SGD:a@shop.com", label: "Razer SG A", currency: "SGD" }], admin);
    await ledger.recordEntry({ requestId: "00000000-0000-4000-8000-000000000001", kind: "use", accountId: account.id, amount: "5",
      orderRef: "K2", note: "เติมมือส่วนที่เหลือของ K2", occurredAt: at("04:00") }, admin);
    await ledger.recordEntry({ requestId: "00000000-0000-4000-8000-000000000002", kind: "deposit", accountId: account.id, amount: "100",
      thbAmount: "2500", note: "โอนเติม", occurredAt: at("07:30") }, admin);
    const report = await createInventoryCheck({ select, ledger: () => { opened++; return ledger; } })
      .check(viewer, { provider: "razer", ...day, withLedger: true });
    assert.ok(opened > 0);
    const a = report.wallets.find(w => w.currency === "SGD");
    assert.equal(a.registered, true);
    assert.deepEqual(a.gaps.map(g => [g.kind, g.amount]), [["between", "5.0000"], ["receipt", "2.0000"]]);
    assert.deepEqual([a.unexplainedIn, a.unexplainedOut], ["0.0000", "5.0000"]);
    // K2 was bought by the bot AND recorded as a hand fill: flagged for a person to confirm
    assert.deepEqual(a.doubleCounted, ["K2"]);
    assert.equal(report.wallets.find(w => w.currency === "CAD").registered, false);
  });
} finally {
  await db.close();
}

console.log(`${passed} passed`);
