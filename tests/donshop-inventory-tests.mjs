import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as lib from "../src/lib/donshop-inventory.js";
import * as access from "../src/lib/usdcodashop-inventory.js";
import { allocateShellSale } from "../src/lib/garena-shell-inventory.js";
import { TOPUP_INVENTORY_PROVIDERS } from "../src/lib/topup-inventory.js";
let passed = 0;
const eq = (a, b) => { assert.deepEqual(a, b); passed++; };
const check = (v) => { assert.ok(v); passed++; };
const rejects = async (fn, status) => { await assert.rejects(fn, (e) => e.status === status); passed++; };
const dates = { dateFrom: "2026-10-01", dateTo: "2026-10-21" }, actor = { permissions: ["projectm.claim"] }, rate = lib.DONSHOP_REFERENCE_RATE;
const raw = (id, patch = {}) => ({ id, source_base: "ORDER/1", source: "PAGE", status: "completed", occurred_at: "2026-10-20T01:00:00Z",
  live_cost_total: "81333", live_cost: "81333", quantity: "1", balance_before: "12492944", game_name: "Game", pack_name: "Pack",
  sheet_fields: { saleThb: "200.00", saleTotalThb: "200.00" }, ...patch });
const normalize = (row) => lib.dsOrder(row, rate);

eq(lib.dsFilters(dates).bounds.start, "2026-09-30T17:00:00.000Z");
eq(lib.dsFilters(dates).status, null); eq(lib.dsFilters({ ...dates, status: "failed" }).status, "failed");
for (const patch of [{ dateFrom: "2026-02-30" }, { dateTo: "2027-01-31" }, { rate: "0" }, { rate: "-1" }, { rate: "1e3" }, { status: "completed' OR 1=1" }]) await rejects(async () => lib.dsFilters({ ...dates, ...patch }), 400);

// IDR out prefers live_cost_total, falls back to live_cost × quantity, never guesses.
eq(lib.dsUsed({ live_cost_total: "81333" }), "81333.00");
eq(lib.dsUsed({ live_cost: "1000", quantity: "3" }), "3000.00");
eq(lib.dsUsed({ live_cost: "1000" }), "1000.00");
eq(lib.dsUsed({ live_cost: "1000", quantity: "0" }), null);
eq(lib.dsUsed({}), null);

const done = normalize(raw(1));
eq(done.figures, { sale: "200.00", cost: "154.53", profit: "45.47", margin: "22.74" });
eq(done.wallet, { before: "12492944.00", used: "81333.00", amount: "12411611.00", checkedAt: "2026-10-20T01:00:00.000Z", orderId: "1" });
eq(lib.dsOrder(raw(1), "0.002").figures.cost, "162.67");

// Non-completed fills are listed but never count as sale, cost, IDR out or wallet drawdown.
const manual = normalize(raw(2, { status: "manual" }));
eq(manual.used, null); eq(manual.quoted, "81333.00"); eq(manual.wallet, null); eq(manual.figures.sale, null); eq(manual.figures.cost, null);

const [retry] = lib.groupDsOrders([normalize(raw(3, { status: "failed" })), normalize(raw(4))], rate);
eq(retry.fillCount, 2); eq(retry.completedCount, 1); eq(retry.statuses, { failed: 1, completed: 1 });
eq(retry.used, "81333.00"); eq(retry.figures.sale, "200.00"); eq(retry.figures.cost, "154.53");
const [onlyFailed] = lib.groupDsOrders([normalize(raw(5, { status: "failed", source_base: "ORDER/2" }))], rate);
eq(onlyFailed.used, null); eq(onlyFailed.figures.sale, null); eq(onlyFailed.wallet, null);

const pair = lib.groupDsOrders([1, 2].map((id) => normalize(raw(id, { live_cost_total: "10", sheet_fields: { saleThb: "0.50", saleTotalThb: "1" } }))), rate)[0];
eq(pair.used, "20.00"); eq(pair.figures.sale, "1.00"); eq(pair.figures.cost, "0.04");
eq(lib.groupDsOrders([normalize(raw(1)), normalize(raw(2, { sheet_fields: { saleThb: "1", saleTotalThb: "2" } }))], rate)[0].figures.sale, null);
eq(lib.groupDsOrders([normalize(raw(1)), { ...normalize(raw(2)), source: "other" }], rate).length, 2);
const walletGroup = lib.groupDsOrders([normalize(raw(1)), normalize(raw(2, { occurred_at: "2026-10-20T02:00:00Z", balance_before: "12411611" }))], rate)[0];
eq(walletGroup.wallet.amount, "12330278.00");

const summary = lib.dsSummary([retry, onlyFailed]);
eq(summary.orders, 2); eq(summary.delivered, 1); eq(summary.fills, 3); eq(summary.statuses, { failed: 2, completed: 1 });
eq(summary.sale, "200.00"); eq(summary.used, "81333.00"); eq(summary.missingSales, 0);
eq(lib.dsSummary([onlyFailed]).sale, "0.00");
eq(lib.dsSummary([lib.groupDsOrders([normalize(raw(6, { sheet_fields: {} }))], rate)[0]]).profit, null);

// Wallet continuity: each completed balance_before must equal the previous completed balance_before − IDR out.
const fill = (id, status, bb, cost, minute) => ({ id, source_order_id: `K${id}`, status, balance_before: bb, live_cost_total: cost, occurred_at: `2026-10-20T01:${String(minute).padStart(2, "0")}:00Z` });
const chainRows = [
  fill(11, "completed", "900", "50", 1), // exact: 1000 − 100
  fill(12, "failed", "850", "30", 2),
  fill(13, "completed", "820", "20", 3), // 850 − 30 → failed 12 was charged
  fill(14, "completed", "700", "10", 4), // expected 800 → 100 left outside the bot
  fill(15, "completed", null, "40", 5), // no balance_before, still drawn down
  fill(16, "completed", "650", "10", 6), // 690 − 40 exact
  fill(17, "completed", "5640", "10", 7), // +5000 top-up
  fill(18, "completed", "5630", null, 8), // exact, but no IDR out → chain restarts
  fill(19, "completed", "1", "1", 9), // unchecked
];
const anchorRow = fill(10, "completed", "1000", "100", 0);
const chainAlerts = lib.dsWalletChecks(chainRows, anchorRow);
eq(chainAlerts.map((a) => a.key), ["charged:13", "gap:14", "evidence:15", "topup:17", "evidence:18"]);
const [charged, gap] = chainAlerts;
eq(charged.amount, "30.00"); eq(charged.suspects.map((s) => [s.id, s.status, s.quoted]), [["12", "failed", "30.00"]]); eq(charged.from.orderId, "K11");
eq([gap.amount, gap.expected, gap.actual, gap.from.id, gap.between.length], ["100.00", "800.00", "700.00", "13", 0]);
eq(chainAlerts[2].missing, "before"); eq(chainAlerts[3].amount, "5000.00"); eq(chainAlerts[4].missing, "used");
eq(lib.dsWalletChecks(chainRows).map((a) => a.key)[0], "charged:13"); // no anchor: first fill only starts the chain
const pairCharged = lib.dsWalletChecks([fill(2, "failed", "90", "10", 1), fill(3, "manual", "90", "20", 2), fill(4, "completed", "70", "1", 3)], fill(1, "completed", "100", "0", 0));
eq(pairCharged[0].kind, "charged"); eq(pairCharged[0].suspects.map((s) => s.id), ["2", "3"]);
eq(lib.dsWalletChecks([fill(2, "failed", "90", "7", 1), fill(3, "completed", "70", "1", 2)], fill(1, "completed", "100", "0", 0))[0].kind, "gap");
eq(lib.dsWalletChecks([fill(2, "completed", "100", "5", 1)], fill(1, "completed", "105", "5", 0)), []);
// Charged then given back exactly on the next link → one "refunded" note instead of a loss plus a top-up.
const refund = lib.dsWalletChecks([fill(2, "failed", "100", "30", 1), fill(3, "completed", "70", "0", 2), fill(4, "completed", "100", "0", 3), fill(5, "completed", "90", "0", 4)], fill(1, "completed", "100", "0", 0));
eq(refund.map((a) => [a.key, a.amount]), [["refunded:3", "30.00"], ["gap:5", "10.00"]]);
eq([refund[0].wasKind, refund[0].suspects.map((s) => s.id), refund[0].refund.order.id, refund[0].refund.amount], ["charged", ["2"], "4", "30.00"]);
eq(lib.dsWalletChecks([fill(2, "completed", "70", "0", 1), fill(3, "completed", "99", "0", 2)], fill(1, "completed", "100", "0", 0)).map((a) => a.key), ["gap:2", "topup:3"]); // unequal rise stays separate

eq(chainAlerts.map((a) => a.late), [[], [], [], [], []]);
// Rows changed long after they were created are named on the alert (late entry or slow edit); short bot updates are not.
const late = lib.dsWalletChecks([{ ...fill(2, "manual", "90", "10", 1), updated_at: "2026-10-20T03:01:00Z" }, { ...fill(3, "completed", "90", "1", 2), updated_at: "2026-10-20T01:20:00Z" }], fill(1, "completed", "100", "0", 0));
eq(late[0].kind, "charged"); eq(late[0].late.map((r) => [r.id, r.lateMinutes, r.updatedAt]), [["2", 120, "2026-10-20T03:01:00.000Z"]]);

eq(lib.dsVisibleAlerts(chainAlerts).map((a) => a.key), ["gap:14", "charged:13"]);
eq(lib.dsVisibleAlerts(chainAlerts, { minIdr: "50", kinds: { topup: true, evidence: true } }).map((a) => a.key), ["evidence:18", "topup:17", "evidence:15", "gap:14"]);
eq(lib.dsVisibleAlerts(chainAlerts, { enabled: false }), []);
eq(lib.dsCheckSettings({ enabled: "yes", minIdr: "abc", notify: 1, kinds: { gap: false, sale: true } }),
  { enabled: true, minIdr: "1", kinds: { gap: false, charged: true, refunded: false, evidence: false, topup: false } });

check(lib.dsMatches(retry, "order/1")); check(!lib.dsMatches(retry, "nothing"));
check(lib.dsMatches({ ...retry, fills: [{ id: "290604" }] }, "290604")); check(!lib.dsMatches({ ...retry, fills: [{ id: "290604" }] }, "290605"));
const csv = lib.dsCsv([retry]);
check(csv.includes('"Failed 1 + สำเร็จ 1"')); check(csv.includes('"12492944.00","12411611.00"'));
check(lib.dsCsv([{ ...retry, orderId: '=HYPERLINK("x")' }]).includes("'="));
check(TOPUP_INVENTORY_PROVIDERS.some((p) => p.key === "donshop" && p.ready));

function compile(file, mocks) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}; new Function("require", "exports", output)((key) => { if (!mocks[key]) throw Error(`Unmocked ${key}`); return mocks[key]; }, exports); return exports;
}
let reads = 0, failure = false, walletRows = [], lastArgs = null, chainSql = "", chainArgs = null, chainResult = [];
const select = async (sql, args) => {
  reads++; if (failure) throw Error("private password");
  check(!/SELECT \*|raw_data|password|session|UPDATE |INSERT |DELETE /i.test(sql)); eq(args[0], "DonShopIDR");
  // Zone-less timestamps leave SQL as instants, so the Node time zone cannot shift displayed times.
  check(sql.includes("(c.created_at AT TIME ZONE current_setting('TimeZone')) AS occurred_at")); check(!/c\.(created|updated)_at AS/.test(sql));
  if (sql.includes("LIMIT 1")) { check(!sql.includes("c.created_at >=")); check(sql.includes("c.status='completed'")); return walletRows; }
  if (sql.includes("in_range")) { chainSql = sql; chainArgs = args; return chainResult; }
  lastArgs = args; return [raw(1), raw(2, { status: "failed" })];
};
const server = compile("src/server/donshop-inventory.js", {
  "@/lib/profit-remote-db": { selectQuery: select }, "@/lib/usdcodashop-inventory": access, "@/lib/donshop-inventory": lib,
  "@/server/garena-shell-inventory": { saleJoin: "", enrichShellOrders: async (_s, r) => r },
  "@/lib/garena-shell-inventory": { allocateShellSale }, "@/server/usdcodashop-sale-rates": { prepareCodaSales: async (r) => r },
});
const repository = server.createDonshopInventory({ select, enrich: async (_s, rows) => rows, prepareSales: async (r) => r });
await rejects(() => repository.list({}, dates), 403); eq(reads, 0);
const result = await repository.list(actor, dates);
eq(lastArgs[4], null); eq(result.total, 1); eq(result.summary.statuses, { completed: 1, failed: 1 }); eq(result.summary.sale, "200.00"); eq(result.balance, null);
await repository.list(actor, { ...dates, status: "manual" }); eq(lastArgs[4], "manual");
eq((await repository.list(actor, { ...dates, search: "unmatched" })).total, 0);
walletRows = [raw(9, { source_order_id: "K7336953" })];
const withWallet = await repository.list(actor, { ...dates, search: "unmatched" });
eq(withWallet.balance, "12411611.00"); eq(withWallet.balanceOrderId, "K7336953"); eq(withWallet.total, 0);
// Continuity reads every status in range, anchored on the last completed fill before it; filters do not narrow it.
eq(result.alerts, []); check(!chainSql.includes("c.status=")); check(chainSql.includes("c.updated_at")); eq(chainArgs[1], "9");
walletRows = []; chainResult = chainRows.map((r) => ({ ...r, in_range: true }));
const checked = await repository.list(actor, { ...dates, status: "manual" });
check(chainSql.includes("c.created_at >= ($2::timestamptz - interval '1 day')")); check(chainSql.includes("ORDER BY COALESCE(c.fill_started_at,")); eq(chainArgs[1], "2026-09-30T17:00:00.000Z"); eq(chainArgs[2], "2026-10-21T17:00:00.000Z"); eq(chainArgs[3], "2026-09-30T17:00:00.000Z");
eq(checked.alerts.map((a) => a.key), ["charged:13", "gap:14", "evidence:15", "topup:17", "evidence:18"]);
// The DB's in_range flag decides the cut (not the Node time zone): rows before the range only feed the next link.
// Anchor 110 − 10, minus 5 for the fill without balance_before = 95; 88 means failed 2 (7) was charged. Fill 1's evidence is before the range.
chainResult = [{ ...fill(1, "completed", null, "5", 0), in_range: false }, { ...fill(2, "failed", "100", "7", 1), in_range: false }, { ...fill(3, "completed", "88", "1", 2), in_range: true }];
walletRows = [fill(0, "completed", "110", "10", 0)];
eq((await repository.list(actor, dates)).alerts.map((a) => [a.key, a.amount]), [["charged:3", "7.00"]]);
walletRows = [];
chainResult = Array.from({ length: 20001 }, (_, i) => fill(i, "failed", null, null, 0));
await rejects(() => repository.list(actor, dates), 413); chainResult = [];

let current = actor;
const route = compile("src/app/api/projectm/donshop/route.js", {
  "@/server/auth": { requireAdmin: async () => { if (!current) throw access.inventoryError("login", 401); return current; } },
  "@/lib/http": { jsonOk: (v) => Response.json(v), jsonError: (error, status) => Response.json({ error }, { status }) },
  "@/lib/donshop-inventory": lib, "@/server/donshop-inventory": { donshopInventory: () => repository },
});
const request = (extra = "") => new Request(`https://example.test/api/projectm/donshop?dateFrom=2026-10-01&dateTo=2026-10-21${extra}`);
current = null; eq((await route.GET(request())).status, 401); current = {}; eq((await route.GET(request())).status, 403);
current = actor; const ok = await route.GET(request()); eq(ok.status, 200); eq(ok.headers.get("cache-control"), "no-store");
eq((await route.GET(request("&status=bogus"))).status, 400);
const csvResponse = await route.GET(request("&format=csv")); check(csvResponse.headers.get("content-disposition").includes("donshop-2026-10-01")); check((await csvResponse.text()).includes("IDR ออก"));
failure = true; const bad = await route.GET(request()); eq(bad.status, 503); check(!(await bad.text()).includes("password"));
check(!route.POST && !route.PATCH && !route.DELETE);
console.log(`${passed} passed`);
