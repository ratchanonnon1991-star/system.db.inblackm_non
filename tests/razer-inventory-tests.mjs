import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as lib from "../src/lib/razer-inventory.js";
import * as access from "../src/lib/usdcodashop-inventory.js";
import { hasPermission } from "../src/lib/permissions.js";
import { allocateShellSale } from "../src/lib/garena-shell-inventory.js";
let passed = 0;
const eq = (a, b) => { assert.deepEqual(a, b); passed++; };
const check = (v, msg) => { assert.ok(v, msg); passed++; };
const rejects = async (fn, status) => { await assert.rejects(fn, (e) => e.status === status); passed++; };
const date = { dateFrom: "2026-10-01", dateTo: "2026-10-21" }, actor = { permissions: ["projectm.claim"] };
const stock = { id: "stock-a", email: " Test@Example.com ", zone: "SGD", rate: "20", status: "ACTIVE", bot_enabled: true, gold_balance: "100", silver_balance: "500", last_synced_at: "2026-10-21T00:00:00Z", password_enc: "SECRET", tfa_secret: "SECRET" };
const raw = (id, patch = {}) => ({ history_id: id, id: id + 100, source_base: "ORDER/1", source: "PAGE", purchase_email: "test@example.com", currency_code: "SGD",
  old_balance_gold: "10", deducted: "1", new_balance_gold: "9", new_balance_silver: "600", occurred_at: "2026-10-20T01:00:00Z", sheet_fields: { saleThb: "30", saleTotalThb: "60" }, ...patch });
eq(lib.razerFilters(date).bounds.start, "2026-09-30T17:00:00.000Z");
for (const patch of [{ dateFrom: "2026-02-30" }, { dateTo: "2027-01-31" }, { zone: "USD" }, { rates: "[]" }, { rates: "null" }, { rates: '{"USD":1}' }, { rates: '{"SGD":"0"}' }, { rates: '{"CAD":"1e3"}' }]) await rejects(async () => lib.razerFilters({ ...date, ...patch }), 400);
eq(lib.razerUsage(raw(1)), { used: "1.00", conflict: false });
eq(lib.razerUsage(raw(1, { deducted: "2" })).used, null);
eq(lib.razerUsage(raw(1, { new_balance_gold: "11" })).conflict, true);
eq(lib.razerUsage({ deducted: "0" }).used, "0.00");
eq(lib.razerUsage({}).used, null);
const accounts = lib.razerStockAccounts([stock], [raw(1)]);
eq(accounts.length, 1); eq(accounts[0].gold, "100.00"); eq(accounts[0].balanceSource, "stock");
check(!JSON.stringify(accounts).includes("SECRET"));
eq(lib.razerStockAccounts([{ ...stock, last_synced_at: "2026-10-01T00:00:00Z" }], [raw(1)])[0].gold, "9.00");
const historyOnly = lib.razerStockAccounts([], [raw(1)])[0];
eq(historyOnly.status, "UNVERIFIED"); eq(historyOnly.rate, null); eq(historyOnly.botEnabled, null);
eq(lib.razerStockAccounts([stock], [raw(1, { currency_code: "CAD" })]).length, 2);
await rejects(async () => lib.razerStockAccounts([stock, stock], []), 409);
const entries = [raw(1), raw(2, { old_balance_gold: "9", new_balance_gold: "8", occurred_at: "2026-10-20T01:01:00Z" })].map((r) => lib.razerOrder(r, accounts[0]));
const combined = lib.groupRazerOrders(entries)[0];
eq(combined.used, "2.00"); eq(combined.balance, "8.00"); eq(combined.fillCount, 2);
eq(combined.figures, { sale: "60.00", cost: "40.00", profit: "20.00", margin: "33.33" });
eq(lib.razerOrder(raw(1), null).figures.cost, null);
eq(lib.razerOrder(raw(1), null, { SGD: "19.05" }).figures.cost, "19.05");
eq(lib.razerOrder(raw(1), accounts[0], { CAD: "25" }).figures.cost, "20.00");
eq(lib.groupRazerOrders([entries[0], { ...entries[1], orderId: "ORDER/2" }]).length, 2);
eq(lib.groupRazerOrders([entries[0], lib.razerOrder(raw(2, { purchase_email: "other@example.com" }), null)]).length, 2);
eq(lib.razerSummary([combined]).fills, 2);
eq(lib.razerSummary([combined, { ...combined, figures: { sale: null, cost: null } }]).profit, null);
check(lib.razerMatches(combined, "ORDER/1"));
const csv = lib.razerCsv([{ ...combined, orderId: '=HYPERLINK("x")' }]);
check(csv.startsWith("\uFEFF") && csv.includes("'=") && csv.includes("ต้นทุนอ้างอิง"));
check(csv.includes('"20"'));

function compile(file, mocks) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = {}; new Function("require", "exports", output)((key) => { if (!mocks[key]) throw new Error(`Unmocked ${key}`); return mocks[key]; }, result); return result;
}
let reads = 0, failure = false, stockFailure = false, stockReads = 0;
let stockRows = [stock];
const selectStock = async (sql) => { stockReads++; check(!/SELECT \*|password|secret|totp/i.test(sql)); if (stockFailure) throw new Error("private credentials"); return stockRows; };
const select = async (sql) => {
  reads++; if (failure) throw new Error("password leaked");
  check(!/SELECT \*|receipt_url|razer_response|password/i.test(sql));
  if (sql.includes("DISTINCT ON")) return [raw(1)];
  if (sql.includes("ARRAY_AGG")) { check(!sql.includes("created_at"), "full receipt allocation independent of date range"); return [{ order_id: "101", history_ids: [1] }, { order_id: "102", history_ids: [2] }]; }
  return [raw(1), raw(2)];
};
const server = compile("src/server/razer-inventory.js", {
  "@/lib/db": { getPool: () => { throw new Error("test must inject stock reader"); } }, "@/lib/profit-remote-db": { selectQuery: select },
  "@/lib/usdcodashop-inventory": access, "@/lib/permissions": { hasPermission }, "@/lib/razer-inventory": lib,
  "@/server/garena-shell-inventory": { saleJoin: "", enrichShellOrders: async (_s, r) => r },
  "@/lib/garena-shell-inventory": { allocateShellSale }, "@/server/usdcodashop-sale-rates": { prepareCodaSales: async (r) => r },
});
const repository = server.createRazerInventory({ select, selectStock, enrich: async (_s, rows) => rows.map((r) => ({ ...r, sheet_fields: { saleThb: "60", saleAllocation: { count: 2, position: Number(r.history_id) - 1 } } })), prepareSales: async (r) => r });
await rejects(() => repository.list({}, date), 403); eq(reads + stockReads, 0);
const result = await repository.list(actor, date);
eq(result.total, 1); eq(result.summary.sale, "60.00"); eq(result.summary.cost, "40.00"); eq(result.canOpenStock, false);
eq(result.zones.find((z) => z.zone === "SGD").gold, "100.00"); eq(result.zones.find((z) => z.zone === "CAD").gold, "0.00");
eq((await repository.list(actor, { ...date, zone: "CAD" })).total, 0);
eq((await repository.list(actor, { ...date, search: "ORDER/1" })).accountTotal, 1);
eq((await repository.list(actor, { ...date, rates: '{"SGD":"21"}' }, { exportAll: true })).summary.cost, "42.00");
eq((await repository.list(actor, { ...date, status: "READY" })).total, 1);
stockRows = [{ ...stock, hidden: true }];
eq((await repository.list(actor, date)).total, 0);
eq((await repository.list(actor, { ...date, showHidden: "true" })).total, 1);
stockRows = [{ ...stock, in_use_order_id: "existing-order" }];
eq((await repository.list(actor, { ...date, status: "READY" })).total, 0);
stockRows = [stock];
stockFailure = true;
const partial = await repository.list(actor, date);
eq(partial.stockAvailable, false); eq(partial.accounts[0].status, "UNVERIFIED"); eq(partial.summary.cost, null);
eq(partial.zones.find((z) => z.zone === "CAD").gold, null);
stockFailure = false;
let currentActor = actor;
const route = compile("src/app/api/projectm/razer/route.js", {
  "@/server/auth": { requireAdmin: async () => { if (!currentActor) throw access.inventoryError("login", 401); return currentActor; } },
  "@/lib/http": { jsonOk: (v) => Response.json(v), jsonError: (error, status) => Response.json({ error }, { status }) },
  "@/lib/razer-inventory": lib, "@/server/razer-inventory": { razerInventory: () => repository },
});
const request = (s = "") => new Request(`https://tools.example/api/projectm/razer?dateFrom=2026-10-01&dateTo=2026-10-21${s}`);
currentActor = null; eq((await route.GET(request())).status, 401);
currentActor = {}; eq((await route.GET(request())).status, 403);
currentActor = actor; const ok = await route.GET(request()); eq(ok.status, 200); eq(ok.headers.get("cache-control"), "no-store");
const exportResult = await route.GET(request("&format=csv")); eq(exportResult.status, 200); check(exportResult.headers.get("content-disposition").includes("razer-2026-10-01"));
failure = true; const bad = await route.GET(request()); eq(bad.status, 503); check(!(await bad.text()).includes("password"));
check(!route.POST && !route.PATCH && !route.DELETE);
const page = compile("src/app/projectm/[lang]/topup-inventory/razer/page.js", {
  "next/navigation": { redirect: (path) => { throw Object.assign(new Error("redirect"), { path }); } },
  "@/server/session-user": { getSessionUser: async () => currentActor }, "@/lib/usdcodashop-inventory": access,
  "@/lib/topup-inventory": { topupInventoryPath: () => "/inventory" }, "@/components/razer-inventory": { default: () => null },
  "react/jsx-runtime": { jsx: (component, props) => ({ component, props }) },
});
currentActor = null; await assert.rejects(page.default({ params: Promise.resolve({ lang: "th" }) }), { path: "/" }); passed++;
currentActor = {}; await assert.rejects(page.default({ params: Promise.resolve({ lang: "th" }) }), { path: "/inventory" }); passed++;
currentActor = actor; eq((await page.default({ params: Promise.resolve({ lang: "th" }) })).props.lang, "th");
console.log(`${passed} passed, 0 failed`);
