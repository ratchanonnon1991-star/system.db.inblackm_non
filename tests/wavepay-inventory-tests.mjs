import assert from "node:assert/strict";
import { kyat, waveUsage, wavePhoneKey, waveFilters, normalizeWaveOrder, summarizeWaveLines, waveMatches, waveCostThb, waveDefaultDates } from "../src/lib/wavepay-inventory.js";
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
}, { prepareSales: async (list) => list });
const admin = { id: 1, permissions: ["projectm.admin"] };
const result = await repo.list(admin, { ...month, phone: "09781106479" });
check(calls.every((c) => c.sql.trim().startsWith("SELECT")), "read-only");
check(calls[0].params[0] === "WavePay" && calls[0].params[2] === "2026-10-14T17:00:00.000Z");
check(result.dateFrom === "2026-10-15" && result.dateTo === "2026-10-18");
check(result.lines.length === 2 && result.lines.find((l) => l.phone === "09111111111").balance === "777.00");
check(result.total === 2 && result.entries.every((e) => e.phone === "09781106479"));
check(result.entries[0].orderId === "K101", "newest first");
check(result.entries[1].details.saleThb === "30.00" && result.entries[1].details.salePacks === 2, "multi-pack sale split per pack");
await assert.rejects(repo.list({ id: 2, permissions: [] }, month), { status: 403 }); passed++;
console.log(`${passed} passed`);
