import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as lib from "../src/lib/netease-inventory.js";
import * as access from "../src/lib/usdcodashop-inventory.js";
let passed = 0;
const check = (v, msg) => { assert.ok(v, msg); passed++; };
const eq = (a, b) => { assert.deepEqual(a, b); passed++; };
const rejects = async (fn, status) => { await assert.rejects(fn, (e) => e.status === status); passed++; };
const actor = { permissions: ["projectm.claim"] };
const date = { dateFrom: "2026-10-01", dateTo: "2026-10-19" };
eq(lib.NETEASE_ACCOUNTS.length, 9);
eq(lib.resolveNeteaseAccount({ purchase_email: " InblackOther18@Hotmail.COM " }).id, "pay3");
eq(lib.resolveNeteaseAccount({ purchase_email: "inblacknetease1@hotmail.com", game_name: "Harry Potter" }), null);
eq(lib.resolveNeteaseAccount({ purchase_email: "inblacknetease@hotmail.com", currency: "KRW" }), null);
eq(lib.resolveNeteaseAccount({ purchase_email: "" }), null);
eq(lib.neteaseUsage({ old_balance: "10", new_balance: "6.05", deducted: "3.95" }).used, "3.95");
eq(lib.neteaseUsage({ old_balance: "10", new_balance: "6.05", deducted: "4" }).used, null);
eq(lib.neteaseUsage({ old_balance: "1", new_balance: "3" }).conflict, true);
eq(lib.neteaseUsage({ deducted: "0" }).used, "0.00");
eq(lib.neteaseUsage({ deducted: "1e3" }).used, null);
eq(lib.neteaseCost("99.99", lib.neteaseAccount("pay1")), "2792.72");
eq(lib.neteaseCost("3.98", lib.neteaseAccount("credit2")), "129.27");
eq(lib.neteaseCost("4769", lib.neteaseAccount("krw1")), "100.00");
eq(lib.neteaseCost("1", lib.neteaseAccount("pay1"), { pay1: "30" }), "30.00");
eq(lib.neteaseCost("0", lib.neteaseAccount("pay1")), "0.00");
eq(lib.neteaseCost("4", null), null);
eq(lib.neteaseFilters(date).bounds.start, "2026-09-30T17:00:00.000Z");
for (const patch of [{ dateTo: "2027-01-31" }, { account: "x" }, { dateFrom: "2026-02-30" }, { rates: "null" }, { rates: "[]" }, { rates: '{"pay1":"0"}' }, { rates: '{"fake":1}' }, { rates: '{"pay1":"1e4"}' }]) {
  await rejects(async () => lib.neteaseFilters({ ...date, ...patch }), 400);
}
const raw = (id, extra = {}) => ({ history_id: id, id: id + 1000, purchase_email: "inblacknetease@hotmail.com",
  old_balance: "100", new_balance: "99", deducted: "1", occurred_at: "2026-10-06T01:00:00Z",
  source_base: "216412", source: "PAGE", game_name: "Once Human", pack_name: "Pack", sheet_fields: { saleThb: "30", saleTotalThb: "60" }, ...extra });
const grouped = lib.groupNeteaseOrders([lib.neteaseOrder(raw(1)), lib.neteaseOrder(raw(2, { new_balance: "98", old_balance: "99", occurred_at: "2026-10-06T01:01:00Z" }))]);
eq(grouped.length, 1); eq(grouped[0].used, "2.00"); eq(grouped[0].balance, "98.00"); eq(grouped[0].fillCount, 2);
eq(grouped[0].figures, { sale: "60.00", cost: "55.86", profit: "4.14", margin: "6.90" });
eq(lib.neteaseSummary(grouped).fills, 2);
eq(lib.groupNeteaseOrders([lib.neteaseOrder(raw(1, { source_base: "ABC/1" })), lib.neteaseOrder(raw(2, { source_base: "ABC/2" }))]).length, 2);
eq(lib.groupNeteaseOrders([lib.neteaseOrder(raw(1)), lib.neteaseOrder(raw(2, { purchase_email: "inblackother18@hotmail.com" }))]).length, 2);
const missing = lib.neteaseOrder(raw(3, { purchase_email: "inblacknetease1@hotmail.com" }));
eq(missing.account, "unmapped"); eq(missing.figures.cost, null); eq(lib.neteaseSummary([grouped[0], { ...missing, fillCount: 1 }]).cost, null);
eq(lib.groupNeteaseOrders([missing, lib.neteaseOrder(raw(4, { purchase_email: "inblacknetease1@hotmail.com" }))]).length, 2);
eq(lib.groupNeteaseOrders([lib.neteaseOrder(raw(1)), lib.neteaseOrder(raw(2))], { pay1: "28" })[0].figures.cost, "56.00");
eq(lib.neteaseTotalUsage(grouped), "2.00");
check(lib.neteaseMatches(grouped[0], "216412")); check(lib.neteaseMatches(grouped[0], "ONCE HUMAN"));
const csv = lib.neteaseCsv([{ ...grouped[0], orderId: '=HYPERLINK("x")' }]);
check(csv.startsWith("\uFEFF")); check(csv.includes("'=")); check(csv.includes('"2.00"'));

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function compile(file, mocks) {
  const output = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = {}; new Function("require", "exports", output)((key) => { if (!mocks[key]) throw new Error(`Unmocked ${key}`); return mocks[key]; }, result); return result;
}
let reads = 0, crash = false;
const select = async (sql) => {
  reads++;
  check(!/SELECT\s+\*|provider_response\s*,|receipt_url|masked_card_number/i.test(sql), "safe projections");
  if (crash) throw new Error("password secret");
  if (sql.includes("DISTINCT ON")) return [raw(1)];
  if (sql.includes("ARRAY_AGG")) return [{ order_id: "1001", history_ids: [1] }, { order_id: "1002", history_ids: [2] }];
  return [raw(1), raw(2, { new_balance: "98", old_balance: "99" })];
};
const server = compile("src/server/netease-inventory.js", {
  "@/lib/profit-remote-db": { selectQuery: select }, "@/lib/usdcodashop-inventory": access,
  "@/server/garena-shell-inventory": { saleJoin: "", enrichShellOrders: async (_select, rows) => rows },
  "@/server/usdcodashop-sale-rates": { prepareCodaSales: async (r) => r },
  "@/lib/garena-shell-inventory": await import("../src/lib/garena-shell-inventory.js"), "@/lib/netease-inventory": lib,
});
const repository = server.createNeteaseInventory({ select, enrich: async (_s, rows) => rows.map((r) => ({ ...r, sheet_fields: { ...r.sheet_fields, saleAllocation: { count: 2, position: Number(r.history_id) - 1 }, saleThb: "60" } })), prepareSales: async (r) => r });
await rejects(() => repository.list({}, date), 403); eq(reads, 0);
const result = await repository.list(actor, date);
eq(result.total, 1); eq(result.cards.length, 9); eq(result.entries[0].figures.sale, "60.00");
eq(result.cards.find((c) => c.id === "pay2").balance, null); eq(result.summary.fills, 2);
eq((await repository.list(actor, { ...date, account: "pay3" })).entries.length, 0);
eq((await repository.list(actor, { ...date, search: "not-found" }, { exportAll: true })).total, 0);

let currentActor = actor;
const route = compile("src/app/api/projectm/netease/route.js", {
  "@/server/auth": { requireAdmin: async () => { if (!currentActor) throw access.inventoryError("login", 401); return currentActor; } },
  "@/lib/http": { jsonOk: (v) => Response.json(v), jsonError: (error, status) => Response.json({ error }, { status }) },
  "@/lib/netease-inventory": lib, "@/server/netease-inventory": { neteaseInventory: () => repository },
});
const request = (s = "") => new Request(`https://tools.example/api/projectm/netease?dateFrom=2026-10-01&dateTo=2026-10-19${s}`);
currentActor = null; eq((await route.GET(request())).status, 401);
currentActor = {}; eq((await route.GET(request())).status, 403);
currentActor = actor;
const ok = await route.GET(request()); eq(ok.status, 200); eq(ok.headers.get("cache-control"), "no-store");
const download = await route.GET(request("&format=csv")); eq(download.status, 200); check(download.headers.get("content-disposition").includes("netease-2026-10-01"));
crash = true; const bad = await route.GET(request()); eq(bad.status, 503); check(!(await bad.text()).includes("password"));
check(!route.POST && !route.DELETE && !route.PATCH);
const page = compile("src/app/projectm/[lang]/topup-inventory/netease/page.js", {
  "next/navigation": { redirect: (path) => { throw Object.assign(new Error("redirect"), { path }); } },
  "@/server/session-user": { getSessionUser: async () => currentActor }, "@/lib/usdcodashop-inventory": access,
  "@/lib/topup-inventory": { topupInventoryPath: () => "/inventory" }, "@/components/netease-inventory": { default: () => null },
  "react/jsx-runtime": { jsx: (component, props) => ({ component, props }) },
});
currentActor = null; await assert.rejects(page.default({ params: Promise.resolve({ lang: "th" }) }), { path: "/" }); passed++;
currentActor = {}; await assert.rejects(page.default({ params: Promise.resolve({ lang: "th" }) }), { path: "/inventory" }); passed++;
currentActor = actor; eq((await page.default({ params: Promise.resolve({ lang: "th" }) })).props.lang, "th");
console.log(`${passed} passed, 0 failed`);
