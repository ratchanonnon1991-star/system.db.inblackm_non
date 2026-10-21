import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as lib from "../src/lib/plsbuy-inventory.js";
import * as access from "../src/lib/usdcodashop-inventory.js";
import { allocateShellSale } from "../src/lib/garena-shell-inventory.js";
import { TOPUP_INVENTORY_PROVIDERS } from "../src/lib/topup-inventory.js";
let passed = 0;
const eq = (a, b) => { assert.deepEqual(a, b); passed++; };
const check = (v) => { assert.ok(v); passed++; };
const rejects = async (fn, status) => { await assert.rejects(fn, (e) => e.status === status); passed++; };
const dates = { dateFrom: "2026-10-01", dateTo: "2026-10-21" }, actor = { permissions: ["projectm.claim"] };
const raw = (id, patch = {}) => ({ id, source_base: "ORDER/1", source: "PAGE", occurred_at: "2026-10-20T01:00:00Z", myr_used: "71.74", recorded_cost: null, game_name: "Game", pack_name: "Pack", sheet_fields: { saleThb: "622.42", saleTotalThb: "622.42" }, ...patch });
const normalize = (row) => lib.plsOrder(row, lib.PLSBUY_REFERENCE_RATE);
eq(lib.plsFilters(dates).bounds.start, "2026-09-30T17:00:00.000Z");
for (const patch of [{ dateFrom: "2026-02-30" }, { dateTo: "2027-01-31" }, { rate: "0" }, { rate: "-1" }, { rate: "NaN" }, { rate: "1e3" }]) await rejects(async () => lib.plsFilters({ ...dates, ...patch }), 400);
eq(normalize(raw(1)).figures, { sale: "622.42", cost: "554.05", profit: "68.37", margin: "10.98" });
eq(normalize(raw(1, { recorded_cost: "0" })).figures.cost, "0.00");
eq(lib.plsOrder(raw(1, { recorded_cost: "55" }), "9").figures.cost, "55.00");
eq(normalize(raw(1, { myr_used: null })).figures.cost, null);
eq(normalize(raw(1, { myr_used: "0" })).figures.cost, "0.00");
eq(normalize(raw(1, { ledger_slices: [{ id: 1, typed: false, used: "18", cost: "0", balance: "291.56" }] })).ledger[0].balance, null);
const pair = [1, 2].map((id) => normalize(raw(id, { myr_used: "0.01", sheet_fields: { saleThb: "0.50", saleTotalThb: "1" } })));
const combined = lib.groupPlsOrders(pair)[0];
eq(combined.used, "0.02"); eq(combined.figures.cost, "0.15"); eq(combined.figures.sale, "1.00"); eq(combined.fillCount, 2);
eq(lib.groupPlsOrders([pair[0], { ...pair[1], orderId: "ORDER/2" }]).length, 2);
eq(lib.groupPlsOrders([pair[0], { ...pair[1], source: "other" }]).length, 2);
eq(lib.groupPlsOrders([pair[0], normalize(raw(2, { sheet_fields: { saleThb: "1", saleTotalThb: "2" } }))])[0].figures.sale, null);
eq(lib.plsSummary([combined]).fills, 2);
eq(lib.plsSummary([combined, lib.groupPlsOrders([normalize(raw(3, { myr_used: null, sheet_fields: {} }))])[0]]).profit, null);
check(lib.plsMatches(combined, "order/1"));
check(lib.plsCsv([{ ...combined, orderId: '=HYPERLINK("x")' }]).includes("'="));
check(TOPUP_INVENTORY_PROVIDERS.some((p) => p.key === "plsbuy" && p.ready));
function compile(file, mocks) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}; new Function("require", "exports", output)((key) => { if (!mocks[key]) throw Error(`Unmocked ${key}`); return mocks[key]; }, exports); return exports;
}
let reads = 0, failure = false;
const select = async (sql, args) => {
  reads++; if (failure) throw Error("private password");
  check(!/SELECT \*|raw_data|password|session|UPDATE |INSERT |DELETE /i.test(sql)); eq(args[0], "PlsbuyMYR");
  if (sql.includes("lot_count")) return [{ lot_count: 0, remaining: null }];
  check(sql.includes("c.status='completed'")); return [raw(1), raw(2)];
};
const server = compile("src/server/plsbuy-inventory.js", {
  "@/lib/profit-remote-db": { selectQuery: select }, "@/lib/usdcodashop-inventory": access, "@/lib/plsbuy-inventory": lib,
  "@/server/garena-shell-inventory": { saleJoin: "", enrichShellOrders: async (_s, r) => r },
  "@/lib/garena-shell-inventory": { allocateShellSale }, "@/server/usdcodashop-sale-rates": { prepareCodaSales: async (r) => r },
});
const repository = server.createPlsbuyInventory({ select, enrich: async (_s, rows) => rows.map((r, i) => ({ ...r, sheet_fields: { saleThb: "622.43", saleAllocation: { count: 2, position: i } } })), prepareSales: async (r) => r });
await rejects(() => repository.list({}, dates), 403); eq(reads, 0);
const result = await repository.list(actor, dates);
eq(result.total, 1); eq(result.summary.sale, "622.43"); eq(result.summary.cost, "1108.10"); eq(result.balance, null); eq(result.lotCount, 0);
eq((await repository.list(actor, { ...dates, search: "unmatched" })).total, 0);
check(server.plsLedgerJoin.includes("COALESCE(")); check(server.plsLedgerJoin.includes("p.currency='MYR'"));
let current = actor;
const route = compile("src/app/api/projectm/plsbuy/route.js", {
  "@/server/auth": { requireAdmin: async () => { if (!current) throw access.inventoryError("login", 401); return current; } },
  "@/lib/http": { jsonOk: (v) => Response.json(v), jsonError: (error, status) => Response.json({ error }, { status }) },
  "@/lib/plsbuy-inventory": lib, "@/server/plsbuy-inventory": { plsbuyInventory: () => repository },
});
const request = (extra = "") => new Request(`https://example.test/api/projectm/plsbuy?dateFrom=2026-10-01&dateTo=2026-10-21${extra}`);
current = null; eq((await route.GET(request())).status, 401); current = {}; eq((await route.GET(request())).status, 403);
current = actor; const ok = await route.GET(request()); eq(ok.status, 200); eq(ok.headers.get("cache-control"), "no-store");
const csv = await route.GET(request("&format=csv")); check(csv.headers.get("content-disposition").includes("plsbuy-2026-10-01")); check((await csv.text()).includes("MYR ออก"));
failure = true; const bad = await route.GET(request()); eq(bad.status, 503); check(!(await bad.text()).includes("password"));
check(!route.POST && !route.PATCH && !route.DELETE);
console.log(`${passed} passed`);
