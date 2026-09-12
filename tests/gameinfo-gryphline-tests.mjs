import strict from "node:assert/strict";
import { parseGryphlineRequest, parseGryphlineCatalog, fetchGryphlineCatalog, verifyGryphlineSession, GRYPHLINE_PRODUCTS_URL, GRYPHLINE_APP_CODE } from "../src/server/gameinfo-gryphline-catalog.js";
import { saveGryphlineSession } from "@/server/gameinfo-gryphline-session";
import { getPool, log, reset, setResponder } from "@/lib/db";
import { getRussiaCheckSourceAvailability } from "../src/lib/gameinfo-russia-check-source.js";
import { capturedForm, PROVIDERS } from "../extensions/russia-check/protocol.js";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
// Synthetic contract fixture based on official storefront field usage, no credentials.
const fixture = { region: "TH", productType: [{ code: "future-category" }], productList: [{ productCode: "pack-1", productName: "  Ｎｅｗ  Pack " }, { productCode: "pack-2", productName: "Another pack" }] };
const requestUrl = `${GRYPHLINE_PRODUCTS_URL}?${new URLSearchParams({ token: Buffer.from("fixture-secret").toString("base64"), appCode: GRYPHLINE_APP_CODE, serverId: "server-1" })}`;
const session = { ...parseGryphlineRequest(requestUrl), region: "TH" };
assert.equal(session.kind, "gryphline");
assert.deepEqual(parseGryphlineCatalog(fixture), [{ sku: "pack-1", name: "New Pack" }, { sku: "pack-2", name: "Another pack" }]);
for (const url of [requestUrl.replace("as.gryphline.com", "evil.test"), `${requestUrl}&token=extra`, requestUrl.replace(GRYPHLINE_APP_CODE, "wrong"), `${requestUrl}&category=partial`]) assert.throws(() => parseGryphlineRequest(url));
for (const patch of [{ productList: [] }, { productList: [{ productCode: "x", productName: "" }] }, { productList: [fixture.productList[0], fixture.productList[0]] }, { hasMore: true }, { pagination: {} }, { total: 100 }, { region: "" }]) assert.throws(() => parseGryphlineCatalog({ ...fixture, ...patch }));
const calls = [];
const options = { retryDelay: async () => {}, fetchImpl: async (url, init) => {
  calls.push(url);
  assert.equal(init.headers["X-Language"], "en-us");
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  return Response.json({ status: 0, data: url.pathname.includes("/info/") ? { hgId: "fixture-account" } : fixture });
} };
const verified = await verifyGryphlineSession(requestUrl, options);
assert.equal(verified.catalog.length, 2);
assert.equal(verified.session.scopeHash.length, 64);
assert.deepEqual(calls.map((url) => url.pathname), ["/user/info/v1/basic", "/user/pay/v3/query_web_product"]);
assert.equal((await fetchGryphlineCatalog(verified.session, options)).length, 2);
await assert.rejects(fetchGryphlineCatalog({ ...session, region: "JP" }, options), { authInvalid: true });
for (const response of [new Response(null, { status: 401 }), Response.json({ status: 3 })]) await assert.rejects(fetchGryphlineCatalog(session, { fetchImpl: async () => response }), { authInvalid: true });
let attempts = 0;
assert.equal((await fetchGryphlineCatalog(session, { retryDelay: async () => {}, fetchImpl: async () => { attempts++; if (attempts < 3) throw Error("private transport details"); return Response.json({ status: 0, data: fixture }); } })).length, 2);
assert.equal(attempts, 3);
await assert.rejects(fetchGryphlineCatalog(session, { retryDelay: async () => {}, fetchImpl: async () => new Response(null, { status: 503 }) }), { authInvalid: false });
const source = { provider: "gryphline", authRequired: true, credentialKind: "gryphline", authConfigured: true, authVerifiedAt: new Date(), sourceEnabled: true };
assert.equal(getRussiaCheckSourceAvailability(source).authState, "verified");
assert.equal(getRussiaCheckSourceAvailability({ ...source, authInvalidated: true }).authState, "invalid");

const captureState = { provider: "gryphline", status: "waiting", popupTabId: 30, expiresAt: 10000 };
const details = { method: "GET", tabId: 30, initiator: "https://topup.gryphline.com", url: requestUrl };
assert.equal(capturedForm(details, captureState, 1000), requestUrl);
for (const patch of [{ tabId: 31 }, { initiator: "https://evil.test" }, { method: "POST" }, { url: requestUrl.replace("query_web_product", "create") }, { url: `${requestUrl}&category=1` }]) assert.equal(capturedForm({ ...details, ...patch }, captureState, 1000), null);
assert.equal(capturedForm(details, { ...captureState, provider: "infold" }, 1000), null);
assert.equal(capturedForm(details, captureState, 10001), null);
assert.equal(PROVIDERS.gryphline.storeUrl, "https://topup.gryphline.com/endfield");

const pool = getPool();
reset();
await assert.rejects(saveGryphlineSession(pool, 5, { formData: requestUrl }, {}, { verify: async () => { throw Error("invalid"); } }));
assert.equal(log.length, 0);
for (const mismatch of [false, true]) {
  reset();
  setResponder((sql) => {
    if (sql.startsWith("SELECT * FROM gameinfo_russia_check_sources")) return { rows: [{ provider: "gryphline", game_id: 217, expected_game_name: "ARKNIGHTS: ENDFIELD", catalog_scope_hash: mismatch ? "other-scope" : verified.session.scopeHash }] };
    if (sql.startsWith("SELECT game FROM")) return { rows: [{ game: "ARKNIGHTS: ENDFIELD" }] };
    if (sql.startsWith("SELECT 1 FROM gameinfo_russia_check_items")) return { rows: [{ exists: true }] };
    return { rows: [] };
  });
  const save = saveGryphlineSession(pool, 5, { formData: requestUrl }, { id: 1 }, { verify: async () => verified });
  if (mismatch) { await assert.rejects(save, /ไม่ตรง/); assert.ok(log.some(({ text }) => text === "ROLLBACK")); }
  else { assert.equal((await save).authState, "verified"); assert.ok(log.some(({ text }) => text === "COMMIT")); }
  assert.equal(log.some(({ text }) => /^(INSERT INTO|UPDATE|DELETE FROM) gameinfo_russia_check_(items|events)/.test(text)), false);
}
reset();
console.log(`${assertions} passed`);
