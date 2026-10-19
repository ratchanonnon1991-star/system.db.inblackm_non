import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as lib from "../src/lib/garena-shell-inventory.js";
import * as access from "../src/lib/usdcodashop-inventory.js";

let passed = 0, reads = 0, actor = { id: 16, permissions: ["projectm.admin"] }, crash = false, last;
const check = (value, message) => { assert.ok(value, message); passed++; };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const redirect = (path) => { throw Object.assign(new Error("redirect"), { path }); };
const mocks = {
  "@/server/auth": { requireAdmin: async () => { if (!actor) throw access.inventoryError("login", 401); return actor; } },
  "@/lib/http": { jsonOk: (body) => Response.json(body), jsonError: (error, status) => Response.json({ error }, { status }) },
  "@/lib/garena-shell-inventory": lib,
  "@/lib/usdcodashop-inventory": access,
  "@/lib/topup-inventory": { topupInventoryPath: (lang) => `/projectm/${lang}/topup-inventory` },
  "next/navigation": { redirect },
  "@/server/session-user": { getSessionUser: async () => actor },
  "@/components/garena-shell-inventory": { default: () => null },
  "react/jsx-runtime": { jsx: (component, props) => ({ component, props }) },
  "@/server/garena-shell-inventory": { garenaShellInventory: () => ({ list: async (user, query, options) => {
    if (!access.canViewUsdInventory(user)) throw access.inventoryError("denied", 403);
    const filters = lib.shellFilters(query);
    reads++; last = { filters, options };
    if (crash) throw new Error("postgres password connection secret");
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, cards: [], entries: [] };
  } }) },
};
function compile(file) {
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = {};
  new Function("require", "exports", js)((key) => { if (!mocks[key]) throw new Error(`Unmocked module: ${key}`); return mocks[key]; }, result);
  return result;
}
const route = compile("src/app/api/projectm/garena-shell/route.js");
const request = (suffix = "") => new Request(`https://tools.example/api/projectm/garena-shell?dateFrom=2026-10-01&dateTo=2026-10-19${suffix}`);
actor = null;
check((await route.GET(request())).status === 401 && reads === 0);
actor = { id: 1, permissions: [] };
check((await route.GET(request())).status === 403 && reads === 0);
actor = { id: 1, permissions: ["projectm.claim"] };
const response = await route.GET(request("&account=inblackrb2c&search=K1&page=2"));
check(response.status === 200 && response.headers.get("cache-control") === "no-store");
check(last.filters.account === "inblackrb2c" && last.filters.page === 2 && last.filters.search === "K1");
check(last.options.exportAll === false);
check((await route.GET(request("&account=other"))).status === 400);
const csv = await route.GET(request("&format=csv"));
check(csv.status === 200 && csv.headers.get("content-type").includes("text/csv"));
check(csv.headers.get("content-disposition").includes("garena-shell-2026-10-01-2026-10-19.csv"));
check(last.options.exportAll === true && csv.headers.get("cache-control") === "no-store");
crash = true;
const failure = await route.GET(request());
check(failure.status === 503 && !(await failure.text()).includes("password"), "no raw DB error leaks");
check(!route.POST && !route.PATCH && !route.DELETE, "inventory has no write API");

const page = compile("src/app/projectm/[lang]/topup-inventory/garena-shell/page.js");
const params = Promise.resolve({ lang: "th" });
actor = null;
await assert.rejects(page.default({ params }), { path: "/" }); passed++;
actor = { permissions: [] };
await assert.rejects(page.default({ params }), { path: "/projectm/th/topup-inventory" }); passed++;
actor = { permissions: ["projectm.claim"] };
check((await page.default({ params })).props.lang === "th");
check(page.metadata.title === "Garena Shell | Topup Inventory");
console.log(`${passed} passed`);
