import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { tablePage } from "../src/lib/table-pagination.js";
import { createPagedSnapshots } from "../src/server/paged-snapshots.js";
import { readInventoryPage } from "../src/server/inventory-page.js";
import { readProfitHistoryPage } from "../src/server/profit-history-page.js";
import { profitHistoryPage, PROFIT_HISTORY_FIELDS } from "../src/lib/profit-history-pagination.js";
import { createInventoryPageSession } from "../src/lib/inventory-page-session.js";

let passed = 0;
const eq = (a, b, why) => { assert.deepEqual(a, b, why); passed++; };
const actor = { id: "qa-pagination", role: "admin", permissions: ["projectm.claim", "profit.access"] };
eq(tablePage(0, 999, 25), { page: 1, pageSize: 25, total: 0, totalPages: 1, start: 0, end: 0 }, "empty reports remain navigable");
eq(tablePage(51, 3, 25).start, 50);
eq(tablePage(50, 3, 25).page, 2, "deleting last row clamps to last remaining page");
eq(tablePage(4, -1, 9999).pageSize, 200, "page sizes bounded");
eq(tablePage(4, "bad", "bad").page, 1);

let clock = 1000, sequence = 0, loads = 0;
const store = createPagedSnapshots({ now: () => clock, token: () => `token-${++sequence}`, ttlMs: 100 });
const original = { rows: [{ value: 1 }], date: new Date(0) };
const load = async () => { loads++; return original; };
const first = await store.resolve({ actor, scope: "one", load });
original.rows[0].value = 2;
const next = await store.resolve({ actor, scope: "one", snapshot: first.snapshot, load });
eq(loads, 1, "page two reuses the report"); eq(next.value.rows[0].value, 1, "loader objects cannot mutate retained snapshots");
eq(next.value.date, "1970-01-01T00:00:00.000Z", "date serialization preserves JSON contract");
await store.resolve({ actor: { ...actor, id: "other" }, scope: "one", snapshot: first.snapshot, load }); eq(loads, 2, "tokens never cross users");
await store.resolve({ actor: { ...actor, permissions: [] }, scope: "one", snapshot: first.snapshot, load }); eq(loads, 3, "changed grants cannot reuse old snapshot");
await store.resolve({ actor, scope: "two", snapshot: first.snapshot, load }); eq(loads, 4, "tokens never cross reports");
await store.resolve({ actor, scope: "one", snapshot: first.snapshot, fresh: true, load }); eq(loads, 5, "manual refresh bypasses cached report");
clock += 101; await store.resolve({ actor, scope: "one", snapshot: first.snapshot, load }); eq(loads, 6, "expired token reloads");
await assert.rejects(store.resolve({ actor: {}, scope: "one", load }), { status: 403 }); passed++;
let finish;
const pending = () => new Promise((resolve) => { finish = resolve; loads++; });
const a = store.resolve({ actor, scope: "pending", load: pending }); await Promise.resolve();
const b = store.resolve({ actor, scope: "pending", load: pending }); finish({ rows: [] });
eq((await a).snapshot, (await b).snapshot, "concurrent initial requests coalesce");
const limited = createPagedSnapshots({ maxBytes: 20, maxEntryBytes: 20 });
const large = await limited.resolve({ actor, scope: "large", load: async () => ({ rows: Array.from({ length: 100 }, (_, id) => id) }) });
eq(large.snapshot, null); eq(large.value.rows.length, 100, "budget overflow never truncates data");
let fail = true;
const recover = () => { if (fail) throw new Error("read failed"); return []; };
await assert.rejects(store.resolve({ actor, scope: "failure", load: recover })); passed++;
fail = false; eq((await store.resolve({ actor, scope: "failure", load: recover })).value, [], "failures release pending slot");

const entries = Array.from({ length: 61 }, (_, id) => ({ id, fills: [{ id: `${id}-1` }, { id: `${id}-2` }] }));
let reportReads = 0;
const report = () => { reportReads++; return { entries, total: 61, summary: { sale: "1234.00", cost: null, missingCosts: 4 }, cards: [{ balance: "12.00" }] }; };
const request = (query = "") => new Request(`https://example.test/api/projectm/qa?pageSize=25&dateFrom=2026-11-01${query}`);
const page1 = await readInventoryPage(request(), actor, "qa", report);
const page2 = await readInventoryPage(request(`&page=2&snapshot=${page1.pagination.snapshot}`), actor, "qa", report);
eq(page2.entries.map((r) => r.id), entries.slice(25, 50).map((r) => r.id)); eq(reportReads, 1);
eq(page2.summary, page1.summary, "global totals and unknown costs do not change across pages"); eq(page2.cards, page1.cards);
eq(page2.entries[0].fills.length, 2, "pagination never splits a grouped order's fills");
const last = await readInventoryPage(request(`&page=999&snapshot=${page1.pagination.snapshot}`), actor, "qa", report);
eq(last.page, 3); eq(last.entries.length, 11);
await assert.rejects(readInventoryPage(request(`&snapshot=${page1.pagination.snapshot}`), { id: actor.id, role: "viewer", permissions: [] }, "qa", report), { status: 403 }); passed++;
eq(reportReads, 1, "fresh authorization precedes snapshot lookup and DB work");
await readInventoryPage(request(`&dateTo=2026-11-02&snapshot=${page1.pagination.snapshot}`), actor, "qa", report); eq(reportReads, 2, "filter changes create new report");

const histories = Array.from({ length: 61 }, (_, id) => ({ id, createdAt: new Date(Date.UTC(2026, 10, 1, id)).toISOString(), txid: `tx-${id}`, gameName: id % 2 ? "A" : "B", platform: id % 3 ? "page" : "", account: "account-a" }));
for (const provider of Object.keys(PROFIT_HISTORY_FIELDS)) {
  const result = profitHistoryPage(histories, provider, { page: 2, pageSize: 25, sort: "asc" });
  eq(result.history.map((r) => r.id), histories.slice(25, 50).map((r) => r.id), `${provider} stable ordered pagination`);
  eq(result.pagination.total, 61);
  eq(profitHistoryPage(histories, provider, { search: "tx-60", page: 9 }).history.map((r) => r.id), [60], `${provider} searches beyond initial page and clamps`);
  eq(profitHistoryPage(histories, provider, { platform: "__none__" }).pagination.total, 21);
  const fromMs = new Date(histories[20].createdAt).getTime(), toMs = new Date(histories[30].createdAt).getTime();
  eq(profitHistoryPage(histories, provider, { fromMs, toMs }).pagination.total, 11, "browser epoch dates are inclusive independent of server timezone");
}
const history1 = await readProfitHistoryPage(new Request("https://x/history?page=1&pageSize=25"), actor, "agenh2h", async () => histories);
const history2 = await readProfitHistoryPage(new Request(`https://x/history?page=2&pageSize=25&snapshot=${history1.pagination.snapshot}`), actor, "agenh2h", () => { throw Error("should not read"); });
eq(history2.history.length, 25); eq(history1.games, ["A", "B"]);

const calls = [];
const session = createInventoryPageSession({ request: async (url) => { calls.push(new URL(url, "https://x")); return { page: calls.at(-1).searchParams.get("page") || "1", pageSize: 25, pagination: { snapshot: "abc" } }; } });
await session.run("/report", "page=1&q=a"); await session.run("/report", "page=2&q=a");
eq(calls[0].searchParams.get("pageSize"), "25"); eq(calls[1].searchParams.get("snapshot"), "abc", "page navigation reuses token");
await session.run("/report", "page=2&q=a"); eq(calls[2].searchParams.get("snapshot"), null, "refresh of same page reads fresh");
await session.run("/report", "page=1&q=b"); eq(calls[3].searchParams.get("snapshot"), null, "changed filter reads fresh");
session.cancel();

for (const provider of Object.keys(PROFIT_HISTORY_FIELDS)) {
  let allowed = true, routeLoads = 0;
  const source = readFileSync(new URL(`../src/app/api/profit/${provider}/history/route.js`, import.meta.url), "utf8");
  const route = {}, js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const aggregate = new Proxy({}, { get: () => async () => { routeLoads++; return histories; } });
  new Function("require", "exports", js)((key) => {
    if (key === "@/server/profit-history-page") return { readProfitHistoryPage };
    if (key === "@/server/auth") return { requireProfitAccess: async () => { if (!allowed) throw Object.assign(new Error("denied"), { status: 403 }); return { ...actor, id: `history-route-${provider}` }; } };
    if (key === "@/server/profit-aggregate") return aggregate;
    if (key === "@/lib/http") return { jsonOk: (body) => Response.json(body), handleApiError: (e) => Response.json({ error: e.message }, { status: e.status || 500 }) };
    throw new Error(key);
  }, route);
  const firstResponse = await route.GET(new Request("https://x/history?page=1&pageSize=25"));
  eq(firstResponse.status, 200); eq(firstResponse.headers.get("cache-control"), "no-store");
  const firstBody = await firstResponse.json();
  const later = await route.GET(new Request(`https://x/history?page=3&pageSize=25&snapshot=${firstBody.pagination.snapshot}`));
  eq((await later.json()).history.length, 11); eq(routeLoads, 1, `${provider} route reuses snapshot`);
  allowed = false;
  eq((await route.GET(new Request(`https://x/history?page=2&snapshot=${firstBody.pagination.snapshot}`))).status, 403);
  eq(routeLoads, 1, `${provider} checks current access before cached reads`);
}

{
  let allowed = true, reads = 0;
  const source = readFileSync(new URL("../src/app/api/profit/categories/[categoryId]/cards/[cardId]/route.js", import.meta.url), "utf8");
  const route = {}, js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const snapshots = await import("../src/server/paged-snapshots.js");
  new Function("require", "exports", js)((key) => {
    if (key === "@/lib/table-pagination") return { tablePage };
    if (key === "@/server/paged-snapshots") return snapshots;
    if (key === "@/server/auth") return { requireProfitAccess: async () => { if (!allowed) throw Object.assign(new Error("denied"), { status: 403 }); return { ...actor, id: "card-route-qa" }; } };
    if (key === "@/server/profit-categories") return { getCategory: (id) => id === "qa" ? { id, name: "QA" } : null };
    if (key === "@/server/profit-aggregate") return { cardDetail: async () => { reads++; return { source: "gocash", saleTotal: "123.00", costTotal: null, orders: histories }; } };
    if (key === "@/lib/http") return { jsonOk: (body) => Response.json(body), jsonError: (error, status) => Response.json({ error }, { status }), handleApiError: (e) => Response.json({ error: e.message }, { status: e.status || 500 }) };
    throw new Error(key);
  }, route);
  const context = { params: Promise.resolve({ categoryId: "qa", cardId: "one" }) };
  const first = await route.GET(new Request("https://x/card?page=1&pageSize=25"), context);
  eq(first.status, 200); eq(first.headers.get("cache-control"), "no-store");
  const body = await first.json();
  const next = await route.GET(new Request(`https://x/card?page=2&pageSize=50&snapshot=${body.pagination.snapshot}`), context);
  const data = await next.json(); eq(data.card.orders.length, 11); eq(reads, 1);
  eq(data.card.saleTotal, "123.00"); eq(data.card.costTotal, null, "card totals retain unknown costs across page sizes");
  const filtered = await route.GET(new Request(`https://x/card?page=9&search=tx-60&snapshot=${body.pagination.snapshot}`), context);
  eq((await filtered.json()).card.orders.map((row) => row.id), [60], "GoCash card search covers all pages");
  allowed = false; eq((await route.GET(new Request(`https://x/card?page=2&snapshot=${body.pagination.snapshot}`), context)).status, 403); eq(reads, 1);
}

// Actual route wiring: grants run before cached reads and legacy/CSV contracts remain intact.
for (const provider of ["agenh2h", "donshop", "gamepoint", "garena-shell", "netease", "razer", "plsbuy", "multigamecard"]) {
  const source = readFileSync(new URL(`../src/app/api/projectm/${provider}/route.js`, import.meta.url), "utf8");
  eq(source.includes('!exportAll &&'), true, `${provider} exports bypass read snapshots`);
  eq(source.includes('page: "1"'), true, `${provider} snapshot loader requests complete filtered history`);
}
console.log(`${passed} passed`);
