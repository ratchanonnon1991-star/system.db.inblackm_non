import * as paginationDependency0 from "../src/server/inventory-page.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

let passed = 0, authorized = true, timeout = false, calls = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); passed++; };
const json = (value, status = 200) => Response.json(value, { status });
const list = async (_actor, options, telemetry) => {
  calls++;
  const timing = telemetry?.onTiming || options.onTiming;
  timing("sql", 4.25);
  if (timeout) throw Object.assign(new Error("ประวัติใช้เวลาเกินกำหนด"), { status: 504 });
  return { configured: true, entries: [], lines: [] };
};
const mocks = {
  "@/server/auth": { requireAdmin: async () => { if (!authorized) throw Object.assign(new Error("ไม่มีสิทธิ์"), { status: 403 }); return { id: 1 }; } },
  "@/lib/http": { jsonOk: json, jsonError: (message, status) => json({ error: message }, status) },
  "@/server/usdcodashop-ledger": { codaLedgerRepository: () => ({ list }) },
  "@/server/wavepay-inventory": { wavePayInventory: () => ({ list }) },
  "@/lib/usdcodashop-inventory": { inventoryError: (message, status = 400) => Object.assign(new Error(message), { status }) },
  "@/lib/usdcodashop-report": { codaReportCsv: () => "fixture,csv\r\n" },
};
function load(file) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", output)((name) => { if (name === "@/server/inventory-page") return paginationDependency0; if (!mocks[name]) throw new Error(`Unexpected module ${name}`); return mocks[name]; }, exports);
  return exports;
}
const usd = load("src/app/api/projectm/usdcodashop/ledger/route.js");
const wave = load("src/app/api/projectm/wavepay/route.js");
for (const route of [usd, wave]) {
  const response = await route.GET(new Request("http://localhost/read"));
  check(response.status, 200); check(response.headers.get("cache-control"), "no-store");
  check(/auth;dur=\d+\.\d, sql;dur=4\.3, total;dur=\d+\.\d/.test(response.headers.get("server-timing")), true);
  authorized = false; const before = calls;
  const denied = await route.GET(new Request("http://localhost/read"));
  check(denied.status, 403); check(calls, before); check(denied.headers.get("cache-control"), "no-store");
  authorized = true;
}
timeout = true;
const expired = await usd.GET(new Request("http://localhost/read"));
check(expired.status, 504); check((await expired.json()).error, "ประวัติใช้เวลาเกินกำหนด");
check(expired.headers.get("server-timing").includes("total;dur="), true);
timeout = false;
const csv = await usd.GET(new Request("http://localhost/read?format=csv"));
check(csv.headers.get("content-type"), "text/csv; charset=utf-8");
check(csv.headers.get("server-timing").includes("sql;dur=4.3"), true);
check(await csv.text(), "fixture,csv\r\n");
console.log(`${passed} passed, 0 failed`);
