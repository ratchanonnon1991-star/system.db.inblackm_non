import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as lib from "../src/lib/gamepoint-inventory.js";
import * as access from "../src/lib/usdcodashop-inventory.js";
import { allocateShellSale } from "../src/lib/garena-shell-inventory.js";
import { TOPUP_INVENTORY_PROVIDERS } from "../src/lib/topup-inventory.js";
import { enrichShellOrders } from "../src/server/garena-shell-inventory.js";
let passed = 0;
const eq = (a, b) => { assert.deepEqual(a, b); passed++; };
const check = (v) => { assert.ok(v); passed++; };
const rejects = async (fn, status) => { await assert.rejects(fn, (e) => e.status === status); passed++; };
const dates = { dateFrom: "2026-10-01", dateTo: "2026-10-22" }, actor = { permissions: ["projectm.claim"] };
const line = (key, amount, status = "done") => ({ key, ref: key, amount, status });
const raw = (id, patch = {}) => ({ id, source_base: "ORDER/1", source: "page", quantity: 1,
  occurred_at: "2026-10-21T01:00:00Z", submitted_at: "2026-10-21T01:00:01.000Z", balance_before: "10550.68",
  provider_amount: null, stored_cost: "195.87", lines: [line("a", "200.24")], plan_refs: ["a"], plan_total: 1,
  ledger_slices: [{ id: "ledger", used: "200.24", supported: true, typed: false }],
  game_name: "Crossfire", pack_name: "4500 Coins", sheet_fields: { saleThb: "1680", saleTotalThb: "1680" }, ...patch });
const normalize = (r) => lib.gpOrder(r, lib.GAMEPOINT_RATE);
eq(lib.gpFilters(dates).rate, "7.84");
eq(lib.gpFilters(dates).bounds.start, "2026-09-30T17:00:00.000Z");
for (const patch of [{ dateFrom: "2026-02-30" }, { dateTo: "2027-01-31" }, { rate: "0" }, { rate: "-1" }, { rate: "NaN" }, { rate: "1e3" }]) await rejects(async () => lib.gpFilters({ ...dates, ...patch }), 400);
const example = normalize(raw(299476));
eq(example.used, "200.24"); eq(example.figures.cost, "1569.88"); eq(example.figures.profit, "110.12"); eq(example.figures.margin, "6.55");
eq(example.details.storedCostMyr, "195.87"); eq(example.wallet.amount, "10350.44"); eq(example.wallet.kind, "calculated");
eq(example.details.usageBasis, "provider-lines");
eq(normalize(raw(1, { ledger_slices: [] })).used, "200.24");
eq(normalize(raw(1, { lines: [], provider_amount: "31.87", ledger_slices: [], plan_refs: [] })).used, "31.87");
const multi = raw(1, { quantity: 2, plan_total: 2, plan_refs: ["a", "b"], lines: [line("a", "1.01"), line("b", "2.02")], provider_amount: "2.02", ledger_slices: [] });
eq(normalize(multi).used, "3.03");
eq(normalize({ ...multi, lines: [...multi.lines, line("orphan", "999")] }).used, "3.03");
eq(normalize(raw(1, { lines: [], provider_amount: "1", plan_refs: [], plan_total: null, ledger_slices: [] })).used, null);
for (const patch of [{ lines: [line("a", "1.01")] }, { lines: [line("a", "1.01"), line("b", null)] }, { lines: [line("a", "1.01"), line("b", "2.02", "pending")] }, { lines: [line("a", "1.01"), line("a", "2.02")] }, { lines: [] }]) {
  const unknown = normalize({ ...multi, ...patch }); eq(unknown.used, null); eq(unknown.figures.cost, null); eq(unknown.figures.profit, null); eq(unknown.wallet, null);
}
eq(normalize(raw(1, { lines: [], provider_amount: null })).used, "200.24");
eq(normalize(raw(1, { lines: [], ledger_slices: [], provider_amount: null })).used, null);
eq(normalize(raw(1, { ledger_slices: [{ id: "x", supported: true, used: "199" }] })).details.usageBasis, "conflict");
eq(normalize(raw(1, { ledger_slices: [{ id: "x", supported: true, used: "199" }] })).used, null);
const duplicate = normalize(raw(1, { ledger_slices: [{ id: "x", supported: true, used: "200.24" }, { id: "y", supported: true, used: "200.24" }] }));
eq(duplicate.used, "200.24"); check(duplicate.details.usageWarning.includes("หลายแถว"));
eq(normalize(raw(1, { lines: [line("a", "0")], ledger_slices: [] })).used, "0.00");
eq(normalize(raw(1, { balance_before: "0" })).wallet, null);
eq(lib.gpObservation({ balance_before: "0", submitted_at: "2026-10-21T01:00:00Z" }).before, "0.00");
eq(lib.gpObservation({ balance_before: "100", submitted_at: "not-a-date" }), null);
eq(normalize(raw(1, { balance_before: null })).wallet, null);
const pair = [1, 2].map((id) => normalize(raw(id, { sheet_fields: { saleThb: "50", saleTotalThb: "100" }, lines: [line("a", "0.01")], ledger_slices: [] })));
const combined = lib.groupGpOrders(pair)[0];
eq(combined.fillCount, 2); eq(combined.used, "0.02"); eq(combined.figures.sale, "100.00"); eq(combined.figures.cost, "0.16");
eq(lib.groupGpOrders([pair[0], { ...pair[1], source: "other" }]).length, 2);
eq(lib.groupGpOrders([pair[0], { ...pair[1], orderId: "ORDER/2" }]).length, 2);
eq(lib.gpSummary([combined]).used, "0.02");
eq(lib.gpSummary(lib.groupGpOrders([normalize(raw(1, { lines: [], ledger_slices: [] }))])).cost, null);
check(lib.gpMatches(combined, "crossfire")); check(!lib.gpMatches(combined, "unmatched"));
check(lib.gpCsv([{ ...combined, orderId: '=HYPERLINK("x")' }]).includes("'="));
check(lib.gpCsv([combined]).includes("คำนวณ ไม่ใช่ API หลังเติม"));
check(TOPUP_INVENTORY_PROVIDERS.some((p) => p.key === "gamepoint" && p.ready));
const identity = lib.gpSaleIdentity({ source: "PAGE", source_base: "218598", source_order_id: "218598:pack:1", sale_order_id: "218598:pack:1", sale_price: "1680" });
eq(identity.sale_order_id, "218598"); eq(identity.sale_price, "1680"); eq(identity.sale_ambiguous, false);
eq(lib.gpSaleIdentity({ ...identity, sale_order_id: "other:pack:1" }).sale_price, null);
eq(lib.gpSaleIdentity({ ...identity, sale_order_id: "other:pack:1" }).sale_ambiguous, true);
eq(lib.gpSaleIdentity({ ...identity, sale_ambiguous: true }).sale_ambiguous, true);
eq(lib.gpSaleIdentity({ source: "PAGE", source_base: "ORDER/2", sale_order_id: "ORDER/2:pack:1" }).sale_order_id, "ORDER/2");
const otherSource = { source: "itemku", source_base: "OD1#2", sale_order_id: "OD1", sale_price: "1000" };
eq(lib.gpSaleIdentity(otherSource), otherSource);
// Regression uses the REAL sale enricher: a unit-only mock missed this mismatch.
const saleRows = [
  { ...raw(299476), source_base: "218598", source_order_id: "218598:pack:1", sale_order_id: "218598:pack:1", sale_price: "1680" },
  { ...raw(299401), source_base: "218594", source_order_id: "218594:pack:1", sale_order_id: "218594:pack:1", sale_price: "270" },
  { ...raw(299271), source_base: "218586", source_order_id: "218586:pack:1", sale_order_id: "218586:pack:1", sale_price: "249.98" },
  ...[1, 2].map((id) => ({ ...raw(id), source_base: "217947", source_order_id: `217947:pack:${id}`, sale_order_id: "217947:pack:2", sale_price: "2450" })),
];
const normalizedSales = saleRows.map(lib.gpSaleIdentity);
const saleSelect = async (sql, args) => {
  check(args[0].every((key) => !key.includes(":")));
  if (sql.includes("AS sale_key")) return [
    ...[299476, 299401, 299271].map((id, i) => ({ sale_key: ["218598", "218594", "218586"][i], pack_count: 1, pack_ids: [id] })),
    { sale_key: "217947", pack_count: 2, pack_ids: [1, 2] },
  ];
  return [];
};
const saleEnriched = await enrichShellOrders(saleSelect, normalizedSales);
const resolvedSales = lib.groupGpOrders(saleEnriched.map((r) => normalize({ ...r, sheet_fields: allocateShellSale(r.sheet_fields) })));
eq(resolvedSales.find((r) => r.orderId === "218598").figures.sale, "1680.00");
eq(resolvedSales.find((r) => r.orderId === "218594").figures.sale, "270.00");
eq(resolvedSales.find((r) => r.orderId === "218586").figures.sale, "249.98");
const multiSale = resolvedSales.find((r) => r.orderId === "217947");
eq(multiSale.figures.sale, "2450.00"); eq(multiSale.fillCount, 2); eq(multiSale.fills.map((r) => r.figures.sale), ["1225.00", "1225.00"]);
const unbound = await enrichShellOrders(saleSelect, [lib.gpSaleIdentity({ ...saleRows[0], sale_order_id: "DIFFERENT:pack:1" })]);
eq(unbound[0].sheet_fields.saleThb, null);
function compile(file, mocks) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}; new Function("require", "exports", output)((key) => { if (!mocks[key]) throw Error(`Unmocked ${key}`); return mocks[key]; }, exports); return exports;
}
let reads = 0, failure = false, duplicates = false;
const select = async (sql, args) => {
  reads++; if (failure) throw Error("private password");
  check(!/SELECT \*|raw_data|password|session|UPDATE |INSERT |DELETE /i.test(sql)); eq(args[0], "GamePointClub");
  if (sql.includes("LIMIT 1")) { check(!sql.includes("c.created_at >=")); return [raw(1)]; }
  check(sql.includes("c.status='completed'")); return [raw(1), raw(duplicates ? 1 : 2)];
};
const server = compile("src/server/gamepoint-inventory.js", {
  "@/lib/profit-remote-db": { selectQuery: select }, "@/lib/usdcodashop-inventory": access, "@/lib/gamepoint-inventory": lib,
  "@/server/garena-shell-inventory": { saleJoin: "", enrichShellOrders: async (_s, r) => r },
  "@/lib/garena-shell-inventory": { allocateShellSale }, "@/server/usdcodashop-sale-rates": { prepareCodaSales: async (r) => r },
});
const repository = server.createGamepointInventory({ select, enrich: async (_s, rows) => rows.map((r, i) => ({ ...r, sheet_fields: { saleThb: "1680", saleAllocation: { count: 2, position: i } } })), prepareSales: async (r) => r });
await rejects(() => repository.list({}, dates), 403); eq(reads, 0);
const result = await repository.list(actor, dates);
eq(result.total, 1); eq(result.summary.sale, "1680.00"); eq(result.summary.used, "400.48"); eq(result.summary.cost, "3139.76");
const empty = await repository.list(actor, { ...dates, search: "unmatched" }); eq(empty.total, 0); eq(empty.observation.before, "10550.68");
duplicates = true; await rejects(() => repository.list(actor, dates), 409); duplicates = false;
let current = actor;
const route = compile("src/app/api/projectm/gamepoint/route.js", {
  "@/server/auth": { requireAdmin: async () => { if (!current) throw access.inventoryError("login", 401); return current; } },
  "@/lib/http": { jsonOk: (v) => Response.json(v), jsonError: (error, status) => Response.json({ error }, { status }) },
  "@/lib/gamepoint-inventory": lib, "@/server/gamepoint-inventory": { gamepointInventory: () => repository },
});
const request = (extra = "") => new Request(`https://example.test/api/projectm/gamepoint?dateFrom=2026-10-01&dateTo=2026-10-22${extra}`);
current = null; eq((await route.GET(request())).status, 401); current = {}; eq((await route.GET(request())).status, 403);
current = actor; const ok = await route.GET(request()); eq(ok.status, 200); eq(ok.headers.get("cache-control"), "no-store");
const csv = await route.GET(request("&format=csv")); check(csv.headers.get("content-disposition").includes("gamepoint-2026-10-01")); check((await csv.text()).includes("MYR ออก"));
failure = true; const bad = await route.GET(request()); eq(bad.status, 503); check(!(await bad.text()).includes("password"));
check(!route.POST && !route.PATCH && !route.DELETE);
console.log(`${passed} passed`);
