import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as inventory from "../src/lib/usdcodashop-inventory.js";
import * as mgc from "../src/lib/multigamecard-inventory.js";
let actor = { id: 16, permissions: ["projectm.admin"] }, reads = 0, writes = 0, lastOptions;
const mocks = {
  "@/server/auth": { requireAdmin: async () => { if (!actor) throw inventory.inventoryError("login", 401); return actor; } },
  "@/lib/http": { jsonOk: (body, status = 200) => Response.json(body, { status }), jsonError: (error, status) => Response.json({ error }, { status }) },
  "@/lib/usdcodashop-inventory": inventory,
  "@/lib/multigamecard-inventory": mgc,
  "@/server/multigamecard-inventory": { multigamecardInventory: () => ({
    list: async (_actor, query, options) => {
      if (!inventory.canViewUsdInventory(_actor)) throw inventory.inventoryError("denied", 403);
      const filters = mgc.mgcFilters(query); reads++; lastOptions = options;
      return { mode: filters.mode, dateFrom: filters.dateFrom, dateTo: filters.dateTo, entries: [], cards: [] };
    },
    save: async (body) => { writes++; mgc.mgcManualInput(body); return { id: "1" }; },
  }) },
};
const source = readFileSync(new URL("../src/app/api/projectm/multigamecard/route.js", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const route = {};
new Function("require", "exports", js)(name => { if (!mocks[name]) throw Error(name); return mocks[name]; }, route);
const url = "https://example.test/api/projectm/multigamecard?dateFrom=2026-10-01&dateTo=2026-10-18";
actor = null; assert.equal((await route.GET(new Request(url))).status, 401); assert.equal(reads, 0);
actor = { id: 17, permissions: [] }; assert.equal((await route.GET(new Request(url))).status, 403);
actor.permissions = ["projectm.claim"];
let response = await route.GET(new Request(url + "&format=csv"));
assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
assert.ok(response.headers.get("content-type").startsWith("text/csv")); assert.equal(lastOptions.exportAll, true);
const body = { action: "card", requestId: "00000000-0000-4000-8000-000000000001", serial: "TEST01", owner: "Test", amount: "0", note: "opening" };
const post = (raw, headers = {}) => route.POST(new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }));
assert.equal((await post(JSON.stringify(body))).status, 403); assert.equal(writes, 0);
actor.permissions = ["projectm.admin"];
assert.equal((await post(JSON.stringify(body), { "sec-fetch-site": "cross-site" })).status, 403);
assert.equal((await post("x", { "content-type": "text/plain" })).status, 400);
assert.equal((await post("{" )).status, 400);
assert.equal((await post('"' + "x".repeat(8192) + '"')).status, 413);
assert.equal(writes, 0);
response = await post(JSON.stringify(body)); assert.equal(response.status, 201); assert.equal(writes, 1);
assert.equal((await response.json()).id, "1");
console.log("passed: MGC API authentication, scoped writes, cross-site denial, JSON/body size, CSV no-store and no pre-validation writes");
