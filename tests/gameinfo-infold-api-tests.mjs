import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import { log, reset, setResponder } from "@/lib/db";
import { signSessionToken } from "@/lib/session";
import { buildInfoldForm, encryptInfoldData } from "@/server/gameinfo-infold-catalog";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
// Run the actual route + auth + repository with recorded DB calls. Replace only
// NextResponse's JSON wrapper so this fixture suite needs no Next server runtime.
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const jsonHelpers = dataUrl('export const jsonOk=(data,status=200)=>Response.json(data,{status}); export const jsonError=(error,status=400)=>Response.json({error},{status});');
const source = readFileSync(new URL("../src/app/api/gameinfo/russia-check/sources/[id]/session/route.js", import.meta.url), "utf8");
const route = await import(dataUrl(source.replace('"@/lib/http"', JSON.stringify(jsonHelpers))));
const downloadSource = readFileSync(new URL("../src/app/api/gameinfo/russia-check/extension/download/route.js", import.meta.url), "utf8");
const downloadRoute = await import(dataUrl(downloadSource.replace('"@/lib/http"', JSON.stringify(jsonHelpers))));
let permissions = ["gameinfo.access"];
let failDatabase = false;
const url = "https://fixture.test/api/gameinfo/russia-check/sources/2/session";
const params = { params: Promise.resolve({ id: "2" }) };
const formData = buildInfoldForm({ data: { nid: "fixture", token: "fixture-secret", role_id: "1", zone_id: "1", area: "global", region: "test", shelf_id: "payment" } }, 1900000000000);
function request({ body = JSON.stringify({ formData }), origin = "https://fixture.test", contentType = "application/json", anonymous = false } = {}) {
  const req = new Request(url, { method: "PUT", headers: { origin, "content-type": contentType }, body });
  req.nextUrl = new URL(url);
  req.cookies = { get: () => anonymous ? undefined : { value: signSessionToken({ sub: 7 }) } };
  return req;
}
reset();
setResponder((sql) => {
  if (sql.includes("FROM gamedb_users u")) return { rows: [{ id: 7, username: "fixture", role: "staff", permissions }] };
  if (sql.startsWith("SELECT id,expected_game_name,auth_required,provider")) {
    if (failDatabase) throw Error("fixture-secret DB detail");
    return { rows: [{ id: 2, provider: "infold", auth_required: true, project_id: "love-and-deepspace", expected_game_name: "LOVE AND DEEPSPACE" }] };
  }
  if (sql.startsWith("SELECT * FROM gameinfo_russia_check_sources")) return { rows: [{ id: 2, provider: "infold", game_id: 3, expected_game_name: "LOVE AND DEEPSPACE" }] };
  if (sql.startsWith("DELETE FROM gameinfo_russia_check_source_credentials")) return { rows: [{ source_id: 2 }] };
  return { rows: [] };
});
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; return Response.json({ code: 0, data: encryptInfoldData({ product_list: [{ product_info: { sku_id: "a", name: "Pack A" } }] }) }); };
try {
  assert.equal(route.GET, undefined);
  assert.equal((await route.PUT(request({ anonymous: true }), params)).status, 401);
  assert.equal((await downloadRoute.GET(request({ anonymous: true }))).status, 401);
  for (const allowed of [["gameinfo.access"], ["gameinfo.access", "gameinfo.market_check"]]) {
    permissions = allowed;
    assert.equal((await route.PUT(request(), params)).status, 403);
    assert.equal((await route.DELETE(request(), params)).status, 403);
    assert.equal((await downloadRoute.GET(request())).status, 403);
  }
  assert.equal(networkCalls, 0);
  permissions = ["gameinfo.access", "gameinfo.admin"];
  const downloadRequest = request();
  downloadRequest.nextUrl = new URL(`${url}?origin=https://evil.test`);
  const download = await downloadRoute.GET(downloadRequest);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/zip");
  assert.equal(download.headers.get("cache-control"), "no-store");
  assert.match(download.headers.get("content-disposition"), /russia-check-connector.zip/);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.match(bytes.toString(), /fixture.test/);
  assert.doesNotMatch(bytes.toString(), /evil.test|fixture-secret/);
  assert.equal((await route.PUT(request({ origin: "https://other.test" }), params)).status, 403);
  assert.equal((await route.DELETE(request({ origin: "https://other.test" }), params)).status, 403);
  assert.equal((await route.PUT(request({ contentType: "text/plain" }), params)).status, 415);
  assert.equal((await route.PUT(request({ body: "invalid json fixture-secret" }), params)).status, 400);
  assert.equal((await route.PUT(request({ body: "x".repeat(131073) }), params)).status, 413);
  assert.equal(networkCalls, 0);
  const response = await route.PUT(request(), params);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.authState, "verified");
  assert.equal(result.verifiedPackCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|session_enc|formData/);
  assert.equal(networkCalls, 1);
  failDatabase = true;
  const failed = await route.PUT(request(), params);
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await failed.text(), /fixture-secret/);
  failDatabase = false;
  log.length = 0;
  assert.equal((await route.DELETE(request(), params)).status, 200);
  assert.ok(log.some(({ text }) => text.includes("enabled=false")));
  assert.equal(log.some(({ text }) => /DELETE FROM gameinfo_russia_check_(items|events)/.test(text)), false);
} finally { globalThis.fetch = originalFetch; reset(); }
console.log(`${assertions} passed`);
