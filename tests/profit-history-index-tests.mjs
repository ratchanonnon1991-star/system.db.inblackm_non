import assert from "node:assert/strict";
import { PROFIT_HISTORY_FIELDS, prepareProfitHistory, profitHistoryPage } from "../src/lib/profit-history-pagination.js";

let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };
// Independent copy of the previous filter-then-sort contract, including ties,
// missing tags, inclusive dates, GoCash order search and malformed legacy dates.
function previous(rows, provider, options) {
  const search = String(options.search || "").trim().toLowerCase(), orderId = String(options.orderId || "").trim().toLowerCase();
  const from = options.fromMs ? Number(options.fromMs) : null, to = options.toMs ? Number(options.toMs) : null;
  return rows.filter((row) => {
    const at = new Date(row.createdAt).getTime();
    if (from && at < from || to && at > to) return false;
    if (options.game === "__none__" ? row.gameName : options.game && row.gameName !== options.game) return false;
    if (options.platform === "__none__" ? row.platform : options.platform && row.platform !== options.platform) return false;
    if (orderId && ![row.saleOrderId, row.orderId, row.txid].some((v) => String(v || "").toLowerCase().includes(orderId))) return false;
    return !search || PROFIT_HISTORY_FIELDS[provider].map((f) => row[f]).filter((v) => v != null && v !== "").join(" ").toLowerCase().includes(search);
  }).sort((a, b) => options.sort === "asc" ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt));
}
const rows = Array.from({ length: 127 }, (_, id) => ({ id,
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, Math.floor((126 - id) / 3))).toISOString(),
  txid: `TX-${id}`, orderId: `ORDER-${id}`, saleOrderId: `SALE-${id}`, gameName: id % 3 ? "A" : "", platform: id % 2 ? "page" : "",
  packName: `PACK-${id % 7}`, invoiceTxnId: `invoice-${id}`, neteaseOrderNo: `NET-${id}`, account: "Account One", slotIndex: 0,
}));
const fromMs = new Date(rows[90].createdAt).getTime(), toMs = new Date(rows[30].createdAt).getTime();
const cases = [{}, { search: "pack-2" }, { platform: "__none__" }, { game: "__none__" }, { platform: "page", game: "A" }, { fromMs, toMs }, { search: "invoice-1" }, { search: "net-1" }, { orderId: "sale-1" }, { search: "0" }];
for (const input of [rows, [...rows.slice(0, 33), { ...rows[33], createdAt: "bad-date" }, ...rows.slice(34)]]) {
  const prepared = prepareProfitHistory(input);
  for (const provider of Object.keys(PROFIT_HISTORY_FIELDS)) for (const sort of ["asc", "desc"]) for (const query of cases) {
    const options = { ...query, sort, pageSize: 25, page: 2 }, expected = previous(input, provider, options);
    const actual = profitHistoryPage(input, provider, options, prepared);
    const start = (Math.min(2, Math.max(1, Math.ceil(expected.length / 25))) - 1) * 25;
    eq(actual.history.map((r) => r.id), expected.slice(start, start + 25).map((r) => r.id), `${provider} ${sort} ${JSON.stringify(query)}`);
    eq(actual.pagination.total, expected.length);
  }
}
let dateReads = 0;
const observed = rows.map((row) => ({ ...row, get createdAt() { dateReads++; return row.createdAt; } }));
const prepared = prepareProfitHistory(observed);
for (let page = 1; page <= 4; page++) profitHistoryPage(observed, "agenh2h", { page, pageSize: 25 }, prepared);
eq(dateReads, rows.length, "page changes do not parse/sort dates again");
assert.strictEqual(prepared.ordered("desc"), prepared.ordered("desc"), "the sorted collection is reused"); passed++;
const refreshed = prepareProfitHistory([...rows, { ...rows[0], id: 999, createdAt: "2027-01-01T00:00:00Z" }]);
eq(profitHistoryPage([], "agenh2h", {}, refreshed).history[0].id, 999, "a refreshed report gets a fresh index");
console.log(`${passed} passed`);
