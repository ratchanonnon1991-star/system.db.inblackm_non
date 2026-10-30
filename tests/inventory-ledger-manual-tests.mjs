// Synthetic rows and an isolated PGlite ledger only. Never connects to application databases.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { quotedAmount, expectedAmount, manualCandidate, matchManualFills, MANUAL_METHOD_PROVIDER } from "../src/lib/inventory-ledger-manual.js";
import { createManualFillCheck } from "../src/server/inventory-ledger-manual.js";
import { createInventoryLedger } from "../src/server/inventory-ledger.js";
import { manualFillsText, manualFillsJson } from "../scripts/lib/inventory-manual-fills-format.mjs";

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`); }
const at = hhmm => `2026-10-26T${hhmm}:00.000Z`;
const viewer = { id: 17, permissions: ["projectm.claim"] };
const admin = { id: 16, username: "Admin", permissions: ["projectm.admin"] };

await check("quoted amounts: first number of the price text, unknown stays null", () => {
  assert.equal(quotedAmount("Ks249,203"), "249203.0000");
  assert.equal(quotedAmount("MYR 10.50"), "10.5000");
  assert.equal(quotedAmount("free"), null);
  assert.equal(quotedAmount("0"), null);
  assert.equal(expectedAmount({ pack_price: "Ks11,000" }, "wavepay"), "11000.0000");
  assert.equal(expectedAmount({ live_cost: "50000", quantity: "2", pack_price: "IDR 1" }, "donshop"), "100000.0000", "Donshop uses its own quote");
  assert.equal(expectedAmount({ pack_price: "SGD 5" }, null), "5.0000");
});

const methods = { ...MANUAL_METHOD_PROVIDER, RazerGold: "razer" };
const row = (id, method, extra) => ({ id, payment_method: method, status: "completed", source_order_id: null, source_base: null,
  pack_price: "Ks5,000", created_at: at("03:20"), updated_at: at("03:40"), ...extra });

await check("candidates: manual on any channel, completed only with a reason", () => {
  const manual = manualCandidate(row(1, "TrueMoney", { status: "manual", pack_price: "฿100" }), methods);
  assert.deepEqual([manual.ref, manual.provider, manual.reason, manual.amount], ["#1", null, "manual", "100.0000"]);
  assert.equal(manualCandidate(row(2, "WavePay", { reason: null }), methods), null);
  const short = manualCandidate(row(3, "WavePay", { reason: "not-charged", source_base: "K3" }), methods);
  assert.deepEqual([short.ref, short.provider, short.reasonText], ["K3", "wavepay", "completed แต่บอทหยุดเพราะยอดไม่พอ (ไม่ได้ตัดเงิน)"]);
  assert.equal(manualCandidate(row(4, "RazerGold", { status: "manual", raw: 1, quarantined: true }), methods).quarantined, true);
});

// Two WavePay SIMs and one Razer wallet with drops nobody explained.
const gap = (from, to, amount, extra = {}) => ({ kind: "between", direction: "out", amount, from: at(from), to: at(to), likely: null, ...extra });
const reports = {
  wavepay: { wallets: [
    { key: "wavepay:0977000111", label: "0977000111", currency: "MMK", gaps: [
      gap("03:01", "04:00", "5000.0000"),                       // = W1
      gap("05:00", "06:00", "3000.0000"),                       // = W2 + W3 together
      gap("07:00", "08:00", "9999.0000"),                       // nobody's
      gap("09:00", "10:00", "7000.0000", { likely: "refunded" }), // given back: not a hand fill
      { ...gap("10:00", "10:01", "1.0000"), kind: "receipt" },   // the bot's own numbers
    ] },
    { key: "wavepay:0966000222", label: "0966000222", currency: "MMK", gaps: [gap("11:00", "12:00", "4000.0000")] },
    { key: "wavepay:0955000333", label: "0955000333", currency: "MMK", gaps: [gap("11:30", "12:30", "4000.0000")] },
  ] },
  razer: { wallets: [{ key: "razer:SGD:a@shop.com", label: "a@shop.com", currency: "SGD", gaps: [gap("13:00", "14:00", "5.0000")] }] },
};
const cands = [
  manualCandidate(row(11, "WavePay", { status: "manual", source_base: "W1" }), methods),
  manualCandidate(row(12, "WavePay", { status: "manual", source_base: "W2", pack_price: "Ks1,000", created_at: at("05:10"), updated_at: at("05:20") }), methods),
  manualCandidate(row(13, "WavePay", { status: "manual", source_base: "W3", pack_price: "Ks2,000", created_at: at("05:30"), updated_at: at("05:40") }), methods),
  manualCandidate(row(14, "WavePay", { reason: "bot-failed", source_base: "W4", pack_price: "Ks4,000", created_at: at("11:40"), updated_at: at("11:50") }), methods),
  manualCandidate(row(15, "WavePay", { status: "manual", source_base: "W5", pack_price: "Ks8,000", created_at: at("15:00"), updated_at: at("15:10") }), methods),
  // same amount, wrong time: outside every gap
  manualCandidate(row(16, "WavePay", { status: "manual", source_base: "W6", created_at: at("20:00"), updated_at: at("20:05") }), methods),
  manualCandidate(row(17, "TrueMoney", { status: "manual", source_base: "T1", pack_price: "฿100" }), methods),
  manualCandidate(row(18, "RazerGold", { reason: "no-receipt", source_base: "R1", pack_price: "SGD 5", created_at: at("13:10"), updated_at: at("13:20") }), methods),
  manualCandidate(row(19, "RazerGold", { status: "manual", source_base: "R2", pack_price: "SGD 5", created_at: at("13:10"), updated_at: at("13:20") }), methods),
];

await check("matching: same channel, same amount, overlapping time", () => {
  const result = matchManualFills(cands, reports, new Set(["R2"]));
  const by = Object.fromEntries(result.candidates.map(c => [c.ref, c]));
  assert.deepEqual([by.W1.verdict, by.W1.places.map(p => p.walletKey)], ["matched", ["wavepay:0977000111"]]);
  assert.deepEqual([by.W2.verdict, by.W2.places[0].together], ["matched", ["W2", "W3"]], "two fills that add up to one drop");
  assert.equal(by.W3.verdict, "matched");
  assert.deepEqual([by.W4.verdict, by.W4.walletCount], ["ambiguous", 2], "two SIMs lost exactly that much at that time");
  assert.equal(by.W5.verdict, "unmatched");
  assert.equal(by.W6.verdict, "unmatched", "a matching amount at the wrong time is not a match");
  assert.equal(by.T1.verdict, "no-check");
  assert.equal(by.R1.verdict, "matched");
  assert.equal(by.R2.verdict, "recorded");
  assert.deepEqual(result.orphanGaps.map(g => [g.walletKey, g.amount]), [["wavepay:0977000111", "9999.0000"]],
    "refunded drops and receipt mismatches are not hand fills");
  assert.deepEqual(result.summary, { total: 9, matched: 4, ambiguous: 1, unmatched: 2, noCheck: 1, checkFailed: 0, recorded: 1, orphanGaps: 1 });
  assert.deepEqual(result.candidates.slice(0, 3).map(c => c.verdict), ["unmatched", "unmatched", "ambiguous"], "work to do comes first");
  assert.equal(matchManualFills(cands, {}, new Set(), new Set(["wavepay"])).candidates.find(c => c.ref === "W1").verdict, "check-failed");
});

// ---------- server, with a fake bot database and a fake wallet check
const queries = [];
async function select(sql, params) {
  queries.push({ sql, params });
  assert.doesNotMatch(sql, /password|otp|cookie|session|token/i);
  if (sql.includes("UNION ALL")) return [
    { provider: "razer", payment_method: "RazerGold", receipts: 50 },
    { provider: "netease", payment_method: "RazerGold", receipts: 1 },
    { provider: "netease", payment_method: "NeteasePay", receipts: 9 },
    { provider: "netease", payment_method: "WavePay", receipts: 2 }, // a fixed channel is never relearned
  ];
  if (sql.includes("AS reason")) {
    return params[0] === "0" ? [
      { ...row(11, "WavePay", { status: "manual", source_base: "W1" }), reason: "manual" },
      { ...row(18, "RazerGold", { source_base: "R1", pack_price: "SGD 5", created_at: at("13:10"), updated_at: at("13:20") }), reason: "no-receipt" },
      { ...row(17, "TrueMoney", { status: "manual", source_base: "T1", pack_price: "฿100" }), reason: "manual" },
    ] : [];
  }
  throw new Error(`unexpected query ${sql.slice(0, 60)}`);
}
const checked = [];
const fakeCheck = { async check(_actor, { provider, dateFrom, dateTo }) {
  checked.push([provider, dateFrom, dateTo]);
  if (provider === "razer") throw new Error("razer table missing");
  return reports[provider];
} };

await check("server: learns Razer/Netease channels, checks the next day too, reports a failed check", async () => {
  const report = await createManualFillCheck({ select, check: fakeCheck }).list(viewer, { dateFrom: "2026-10-26", dateTo: "2026-10-26" });
  assert.deepEqual(report.learnedMethods, { RazerGold: "razer", NeteasePay: "netease" });
  const q = queries.find(x => x.sql.includes("AS reason"));
  assert.deepEqual([q.params[3], q.params[4], q.params[5], q.params[6]],
    [["RazerGold"], ["GamePointClub", "PlsbuyMYR", "DonShopIDR"], ["NeteasePay"], "INSUFFICIENT_BALANCE"]);
  assert.match(q.sql, /c\.status = 'manual'/);
  assert.match(q.sql, /AT TIME ZONE current_setting\('TimeZone'\)/);
  assert.deepEqual(checked, [["razer", "2026-10-26", "2026-10-27"], ["wavepay", "2026-10-26", "2026-10-27"]]);
  assert.deepEqual(report.checkErrors, { razer: "razer table missing" });
  const by = Object.fromEntries(report.candidates.map(c => [c.ref, c.verdict]));
  assert.deepEqual(by, { R1: "check-failed", W1: "matched", T1: "no-check" });
  assert.deepEqual(report.byMethod.map(m => [m.method, m.total]), [["RazerGold", 1], ["WavePay", 1], ["TrueMoney", 1]]);
  assert.ok(report.orphanGaps.length > 0);
});

await check("server: channel filter and input checks", async () => {
  const report = await createManualFillCheck({ select, check: fakeCheck }).list(viewer, { dateFrom: "2026-10-26", dateTo: "2026-10-26", channel: "TrueMoney" });
  assert.deepEqual(report.candidates.map(c => c.ref), ["T1"]);
  const repo = createManualFillCheck({ select, check: fakeCheck });
  await assert.rejects(repo.list({ id: 1, permissions: [] }, { dateFrom: "2026-10-26", dateTo: "2026-10-26" }), { status: 403 });
  await assert.rejects(repo.list(viewer, { dateFrom: "2026-07-01", dateTo: "2026-10-26" }), /92 วัน/);
  await assert.rejects(repo.list(viewer, { dateFrom: "2026-10-26", dateTo: "2026-10-26", withLedger: true }), { status: 500 });
});

await check("output masks phones and e-mails and puts work first", async () => {
  const report = await createManualFillCheck({ select, check: fakeCheck }).list(viewer, { dateFrom: "2026-10-26", dateTo: "2026-10-26" });
  const text = manualFillsText(report);
  if (process.env.SHOW_SAMPLE) console.log(text);
  assert.match(text, /จับคู่ได้ 1/);
  assert.match(text, /✓ น่าจะเติมจาก/);
  assert.match(text, /09\*\*\*\*\*111/);
  assert.ok(!text.includes("0977000111"));
  assert.match(text, /! ตรวจกระเป๋า razer ไม่สำเร็จ/);
  assert.match(text, /ตรวจไม่สำเร็จ 1/);
  assert.match(text, /! ตรวจกระเป๋าช่องทางนี้ไม่สำเร็จ/);
  assert.match(text, /== ยอดหายที่ยังหาออเดอร์ไม่เจอ ==/);
  assert.ok(!JSON.stringify(manualFillsJson(report)).includes("0977000111"));
});

// ---------- ledger: which orders are already recorded
const db = new PGlite();
try {
  const client = { query: (sql, params) => db.query(sql, params), release() {} };
  const ledger = createInventoryLedger({ query: client.query, connect: async () => client }, { now: () => new Date("2026-10-27T00:00:00Z") });
  await check("ledger: recorded hand uses, minus reversed ones", async () => {
    const [account] = await ledger.registerAccounts([{ provider: "wavepay", ref: "0977000111", label: "SIM 1", currency: "MMK" }], admin);
    const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    await ledger.recordEntry({ requestId: uuid(1), kind: "use", accountId: account.id, amount: "5000", orderRef: "W1", note: "เติมมือ" }, admin);
    const wrong = await ledger.recordEntry({ requestId: uuid(2), kind: "use", accountId: account.id, amount: "1000", orderRef: "W2", note: "เติมมือ" }, admin);
    await ledger.recordEntry({ requestId: uuid(3), kind: "reversal", reversesEntryId: wrong.id, note: "ผิดเบอร์" }, admin);
    assert.deepEqual([...await ledger.recordedOrderRefs(viewer, ["W1", "W2", "W9", "", null])], ["W1"]);
    assert.deepEqual([...await ledger.recordedOrderRefs(viewer, [])], []);
  });
} finally {
  await db.close();
}

console.log(`${passed} passed`);
