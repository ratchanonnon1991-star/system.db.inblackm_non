import assert from "node:assert/strict";
import { kyat, waveUsage, wavePhoneKey, waveFilters, normalizeWaveOrder, summarizeWaveLines, waveMatches, waveCostThb, waveDefaultDates, waveShortBalance, waveLedgerPhone, waveGapLines } from "../src/lib/wavepay-inventory.js";
import { createWavePayInventory } from "../src/server/wavepay-inventory.js";
let passed = 0; const check = (v, message) => { assert.ok(v, message); passed++; };

// Phone keys follow the bot's NormalizeWaveMsisdn.
check(wavePhoneKey("09 7811 06479") === "09781106479");
check(wavePhoneKey("+959781106479") === "09781106479");
check(wavePhoneKey("9781106479") === "09781106479");
check(wavePhoneKey(null) === "");

const month = { dateFrom: "2026-10-01", dateTo: "2026-10-18" };
// Counting starts on 2026-10-15 (Thai time): earlier days are clamped, a range entirely before it is refused.
check(waveFilters(month).bounds.start === "2026-10-14T17:00:00.000Z" && waveFilters(month).dateFrom === "2026-10-15");
check(waveFilters({ dateFrom: "2026-10-16", dateTo: "2026-10-18" }).dateFrom === "2026-10-16");
assert.throws(() => waveFilters({ dateFrom: "2026-10-01", dateTo: "2026-10-14" }), { status: 400 }); passed++;
check(waveDefaultDates({ dateFrom: "2026-10-01", dateTo: "2026-10-18" }).dateFrom === "2026-10-15");
check(waveDefaultDates({ dateFrom: "2026-11-01", dateTo: "2026-11-03" }).dateFrom === "2026-11-01");
// Cost = MMK ÷ 126.68, half-up to satang from the exact amount.
check(waveCostThb("5000.00") === "39.47" && waveCostThb("126.68") === "1.00" && waveCostThb("63.34") === "0.50");
check(waveCostThb(null) === null);
check(waveFilters({ ...month, phone: null }).phone === null);
check(waveFilters({ ...month, phone: "" }).phone === "", "unknown-number group is selectable");
check(waveFilters({ ...month, page: "x" }).page === 1);
for (const bad of [{}, { dateFrom: "2026-10-15", dateTo: "2027-03-31" }, { ...month, phone: "abc12" }, { dateFrom: "2026-10-18", dateTo: "2026-10-01" }]) {
  assert.throws(() => waveFilters(bad), { status: 400 }); passed++;
}

const base = { id: 10, source_order_id: "K1", game_name: "G", pack_name: "P", phone_key: "09781106479",
  old_balance: "125000.50", new_balance: "120000.50", pack_price: "Ks5,000", occurred_at: "2026-10-16T03:00:00Z",
  sheet_fields: { saleThb: "60.00", saleCurrency: "THB" } };
const one = normalizeWaveOrder(base);
check(one.usedMmk === "5000.00" && one.balanceMmk === "120000.50" && one.details.costThb === "39.47" && one.phone === "09781106479");
check(kyat("Ks11,000") === "11000.00" && kyat("125000.5") === "125000.50" && kyat("N/A") === null && kyat(null) === null);
const fallback = normalizeWaveOrder({ ...base, id: 11, old_balance: null });
check(fallback.usedMmk === "5000.00" && fallback.usedSource === "pack" && fallback.details.costThb === "39.47", "pack_price only when the before/after pair is missing");
check(waveUsage({ old_balance: "100", new_balance: "200", pack_price: null }).usedMmk === null, "a rising balance is not usage");
check(one.usedSource === "balances");
const loss = normalizeWaveOrder({ ...base, id: 12, old_balance: "130000.50", sheet_fields: { saleThb: "60.00" } });
const unknown = normalizeWaveOrder({ ...base, id: 13, phone_key: "", sheet_fields: { saleThb: null } });
const lines = summarizeWaveLines([one, loss, unknown], [{ ...base, id: 99, new_balance: "100000" }]);
check(lines[0].phone === "09781106479" && lines.at(-1).phone === "", "unknown number listed last");
const first = lines[0];
check(first.orders === 2 && first.used === "15000.00" && first.sale === "120.00" && first.cost === "118.41");
check(first.profit === "1.59" && first.margin === "1.33", "a loss on one order is netted, not dropped");
check(first.balance === "100000.00" && first.balanceOrderId === "K1");
check(lines[1].sale === null && lines[1].missingSales === 1, "unknown sale makes the total unknown, not zero");
check(waveMatches(one, "k1") && !waveMatches(one, "zzz") && waveMatches(one, ""));

// Server: pages through orders, enriches in batches, filters by phone without hiding other lines.
const calls = [];
const orders = Array.from({ length: 3 }, (_, i) => ({ ...base, id: 100 + i, source_order_id: `K${100 + i}`, phone_key: i === 2 ? "09111111111" : "09781106479",
  sale_price: "60", source: "PAGE", occurred_at: `2026-10-1${5 + i}T03:00:00Z` }));
const repo = createWavePayInventory(async (sql, params) => {
  calls.push({ sql, params });
  if (sql.includes("pack_count")) return [{ sale_key: "K100", pack_count: 2 }];
  if (sql.includes("FROM sheet_jobs")) return [];
  if (sql.includes("DISTINCT ON (CASE")) return [{ ...base, id: 102, phone_key: "09111111111", new_balance: "777" }];
  return params[1] === "0" ? orders : [];
}, { prepareSales: async (list) => list,
  // Gaps between bot readings (as the chain check reports them) and what people recorded.
  balanceGaps: async (_actor, q) => { gapQueries.push(q); if (gapFailure) throw gapFailure; return { wallets: [
    { label: "09781106479", unexplainedOut: "15000.0000", unexplainedIn: "50000.0000", gaps: [
      { kind: "between", from: "2026-10-16T02:00:00Z", to: "2026-10-16T09:00:00Z", direction: "out", amount: "10000.0000", likely: null },
      { kind: "between", from: "2026-10-17T02:00:00Z", to: "2026-10-17T03:00:00Z", direction: "out", amount: "5000.0000", likely: null },
      { kind: "receipt", from: "2026-10-17T04:00:00Z", to: "2026-10-17T04:01:00Z", direction: "out", amount: "1.0000", likely: null }] }] }; },
  selectLedger: async (sql, params) => { ledgerCalls.push({ sql, params }); if (ledgerFailure) throw ledgerFailure; return [
    { label: "WAVEPAY 3 (06479)", kind: "use", amount: "10000.0000", order_ref: "Q1", occurred_at: "2026-10-15T17:00:00Z", actor_label: "RIN" },
    { label: "WAVEPAY 3 (06479)", kind: "deposit", amount: "50000.0000", order_ref: null, occurred_at: "2026-10-16T05:00:00Z", actor_label: "Admin" },
    { label: "WAVEPAY 9 (99999)", kind: "use", amount: "1.0000", order_ref: "Q2", occurred_at: "2026-10-16T05:00:00Z", actor_label: "RIN" }]; } });
let gapFailure = null, ledgerFailure = null;
const gapQueries = [], ledgerCalls = [];
const admin = { id: 1, permissions: ["projectm.admin"] };
const result = await repo.list(admin, { ...month, phone: "09781106479" });
check(calls.every((c) => c.sql.trim().startsWith("SELECT")), "read-only");
check(calls[0].params[0] === "WavePay" && calls[0].params[2] === "2026-10-14T17:00:00.000Z");
check(result.dateFrom === "2026-10-15" && result.dateTo === "2026-10-18");
check(result.lines.length === 2 && result.lines.find((l) => l.phone === "09111111111").balance === "777.00");
check(result.total === 2 && result.entries.every((e) => e.phone === "09781106479"));
check(result.entries[0].orderId === "K101", "newest first");
check(result.entries[1].details.saleThb === "30.00" && result.entries[1].details.salePacks === 2, "multi-pack sale split per pack");
// Balance gaps beside recorded hand fills, per SIM.
check(gapQueries[0].dateFrom === "2026-10-15" && ledgerCalls[0].params[0] === "2026-10-14T17:00:00.000Z", "same range for gaps and ledger");
check(/e\.kind IN \('use','deposit','adjust_in','adjust_out'\)/.test(ledgerCalls[0].sql) && ledgerCalls[0].sql.includes("reverses_entry_id"), "ledger read leaves reversed rows out");
const sim = result.lines.find((l) => l.phone === "09781106479").check;
check(sim.gapOut === "15000.00" && sim.recordedOut === "10000.00" && sim.unrecordedOut === "5000.00", "missing − recorded = unrecorded");
check(sim.gapIn === "50000.00" && sim.recordedIn === "50000.00");
check(sim.gaps.length === 2, "only gaps between bot orders, not the bot's own receipt mismatch");
check(sim.gaps[0].recorded.length === 1 && sim.gaps[0].recorded[0].orderRef === "Q1", "a sheet row dated that Bangkok day sits in the gap");
check(sim.gaps[1].recorded.length === 0, "a gap with nothing recorded");
check(result.unmatchedLedger.length === 1 && result.unmatchedLedger[0] === "WAVEPAY 9 (99999)", "a tab whose digits match no SIM is listed");
check(result.gapsAvailable && result.ledgerAvailable);
gapFailure = Object.assign(new Error("too many"), { status: 413 }); ledgerFailure = Object.assign(new Error("down"), { code: "ECONNREFUSED" });
const degraded = await repo.list(admin, month);
check(!degraded.gapsAvailable && !degraded.ledgerAvailable && degraded.total === 3, "the page still loads without gaps or ledger");
ledgerFailure = Object.assign(new Error("no table"), { code: "42P01" }); gapFailure = null;
check((await repo.list(admin, month)).ledgerAvailable, "no ledger tables yet is not a failure");
ledgerFailure = null;
check(waveLedgerPhone("WAVEPAY 1 (80888)", ["09111180888", "09222222222"]) === "09111180888");
check(waveLedgerPhone("WAVEPAY 1 (80888)", ["09111180888", "09333380888"]) === null, "two SIMs with those digits: no guess");
check(waveLedgerPhone("WAVEPAY 1", ["09111180888"]) === null);
const over = waveGapLines([{ label: "09111180888", unexplainedOut: "100", unexplainedIn: "0", gaps: [] }],
  [{ label: "W (80888)", kind: "use", amount: "300", occurred_at: "2026-10-16T05:00:00Z" }], ["09111180888"]).lines.get("09111180888");
check(over.unrecordedOut === "0.00" && over.overRecorded, "more recorded than missing is flagged, never negative");
const onlyRecorded = waveGapLines([], [{ label: "W (70777)", kind: "use", amount: "5", occurred_at: "2026-10-16T05:00:00Z" }], ["09222270777"]).lines.get("09222270777");
check(onlyRecorded.gapOut === null && onlyRecorded.recordedOut === "5.00", "records on a SIM the bot did not read still show");
await assert.rejects(repo.list({ id: 2, permissions: [] }, month), { status: 403 }); passed++;
// The bot stopped before the PIN because the SIM was short (order 307174): nothing left this SIM.
// A person then filled it another way, so the cost is unknown here, never the pack price.
const short = normalizeWaveOrder({ ...base, id: 20, old_balance: null, new_balance: null, pack_price: "Ks249,203",
  bot_status: "failed", bot_error_code: "INSUFFICIENT_BALANCE" });
check(short.usedMmk === "0.00" && short.usedSource === "not-charged" && short.details.costThb === null, "short balance is not MMK out");
const failed = normalizeWaveOrder({ ...base, id: 21, old_balance: null, new_balance: null, bot_status: "failed", bot_error_code: "TIMEOUT" });
check(failed.usedMmk === null && failed.usedSource === "bot-failed", "another bot failure is unknown, not the pack price");
check(normalizeWaveOrder({ ...base, id: 22, bot_status: "failed", bot_error_code: "INSUFFICIENT_BALANCE" }).usedSource === "balances", "a balance pair still wins");
check(waveShortBalance("WavePay balance 202487 Ks insufficient for pack 249203 Ks — top up or switch SIM before PIN") === "202487.00");
check(waveShortBalance("timeout") === null && waveShortBalance(null) === null);
const shortLines = summarizeWaveLines([one, short], [{ ...base, id: 98, new_balance: "202487", later_orders: 1, later_uncharged: 1, later_at: "2026-10-26T06:26:26Z" }]);
check(shortLines[0].used === "5000.00" && shortLines[0].cost === null && shortLines[0].missingCosts === 1, "the unknown cost shows as incomplete");
check(shortLines[0].balance === "202487.00" && shortLines[0].laterOrders === 1 && shortLines[0].laterUncharged === 1
  && shortLines[0].laterAt === "2026-10-26T06:26:26.000Z", "older reading plus what came after it");
const latestSql = calls.find((c) => c.sql.includes("later_orders"));
check(latestSql && latestSql.sql.includes("'newBalance'),'') IS NOT NULL") && latestSql.params[1] === "INSUFFICIENT_BALANCE",
  "the card uses the latest order that recorded a balance");
console.log(`${passed} passed`);
