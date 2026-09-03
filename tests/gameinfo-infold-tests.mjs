import strict from "node:assert/strict";
import { buildInfoldForm, decryptInfoldData, encryptInfoldData, fetchInfoldCatalog, INFOLD_CATALOG_URL, parseInfoldCatalog, parseInfoldFormData, signInfoldForm } from "@/server/gameinfo-infold-catalog";
import { saveInfoldSession } from "@/server/gameinfo-infold-session";
import { decryptRussiaCheckSession } from "@/server/crypto";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
// Synthetic account and catalog only. CI never contacts Infold.
const context = { nid: "123", token: "fixture-only-token", role_id: "456", zone_id: "1", area: "global", region: "fixture-region", shelf_id: "payment", lang: "en", os_platform: 61, sdk_channel: 1 };
const capture = (data = context) => buildInfoldForm({ data }, 1784168030000);
const session = parseInfoldFormData(capture());
const product = (sku, text) => ({ product_info: { sku_id: sku, name: [{ lang: "en", text }] }, price_info: { amount: 999 }, limit_info: { remaining: 0 } });
const fixture = { product_list: [product("b", " Pack B "), product("a", "Pack A")] };
const expected = [{ sku: "a", name: "Pack A" }, { sku: "b", name: "Pack B" }];
assert.equal(encryptInfoldData({ probe: "fixture" }), "c/wkow08DlSzr7bC7as7n1/RA98wa0CHiFaVJeLMzGM=");
assert.equal(signInfoldForm({ app_id: "1010001", clientid: "1067", lang: "en", sign_type: "hmac", timestamp: "1234567890", data: "ignored" }), "8ebe59b3e574a0306bcd832a1ac265aa");
assert.deepEqual(decryptInfoldData(encryptInfoldData(context)), context);
assert.deepEqual(session.data, context);
assert.equal(session.kind, "infold");
assert.equal(session.version, 1);
const lines = [...new URLSearchParams(capture())].map(([key, value]) => `${key}: ${value}`).join("\n");
assert.deepEqual(parseInfoldFormData(lines), session);
const filtered = parseInfoldFormData(capture({ ...context, category_id: "limited", page: 2, cart: "ignore" }));
assert.deepEqual(filtered, session);
assert.equal(parseInfoldFormData(capture({ ...context, token: "rotated" })).scopeHash, session.scopeHash);
assert.notEqual(parseInfoldFormData(capture({ ...context, role_id: "789" })).scopeHash, session.scopeHash);
assert.notEqual(parseInfoldFormData(capture({ ...context, region: "changed" })).scopeHash, session.scopeHash);
for (const invalid of ["", "cookie=fixture", "x".repeat(65537), capture() + "&app_id=1010001", capture() + "&extra=1", capture().replace("clientid=1067", "clientid=wrong"), capture().replace("lang=en", "lang=ru"), capture().replace(/&sign=.*/, "&sign=00000000000000000000000000000000"), capture().replace(/&data=[^&]*/, "&data=malformed")]) {
  assert.throws(() => parseInfoldFormData(invalid));
}
for (const key of ["nid", "token", "role_id", "zone_id", "area", "region"]) assert.throws(() => parseInfoldFormData(capture({ ...context, [key]: "" })));
assert.throws(() => parseInfoldFormData(capture({ ...context, shelf_id: "other" })));
assert.throws(() => decryptInfoldData("fixture-secret-must-not-be-echoed"), (error) => !error.message.includes("fixture-secret"));
const fresh = new URLSearchParams(buildInfoldForm(session, 1900000000000));
assert.equal(fresh.get("timestamp"), "1900000000");
assert.equal(fresh.get("sign"), signInfoldForm(Object.fromEntries(fresh)));
assert.deepEqual(parseInfoldCatalog(fixture), expected);
assert.deepEqual(parseInfoldCatalog({ ...fixture, pagination: { total: 2, has_more: false } }), expected);
assert.deepEqual(parseInfoldCatalog({ ...fixture, pagination: {} }), expected);
for (const pagination of [{ has_more: true }, { total: 3 }, { offset: 1, total: 2 }, { page: 2, total: 2 }, { page_size: 2 }, { next: "cursor" }, "bad"]) assert.throws(() => parseInfoldCatalog({ ...fixture, pagination }));
for (const payload of [{}, { product_list: [] }, { product_list: [product("a", "A"), product("a", "A2")] }, { product_list: [product("a", " ")] }, { product_list: [product("", "A")] }, { product_list: [{}] }]) assert.throws(() => parseInfoldCatalog(payload));
const calls = [];
let clock = 1900000000000;
const options = { retryDelay: async () => {}, now: () => clock += 1000 };
assert.deepEqual(await fetchInfoldCatalog(session, { ...options, fetchImpl: async (url, init) => {
  calls.push({ url, init });
  if (calls.length === 1) throw new Error("fixture-secret");
  if (calls.length === 2) return new Response(null, { status: 503 });
  return Response.json({ code: 0, data: encryptInfoldData(fixture) });
} }), expected);
assert.equal(calls.length, 3);
assert.equal(calls[0].url, INFOLD_CATALOG_URL);
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.redirect, "error");
assert.equal(calls[0].init.headers.Cookie, undefined);
assert.notEqual(new URLSearchParams(calls[0].init.body).get("timestamp"), new URLSearchParams(calls[2].init.body).get("timestamp"));
let retries = 0;
await assert.rejects(fetchInfoldCatalog(session, { ...options, fetchImpl: async () => { retries++; throw Error("fixture-secret"); } }), (error) => error.status === 502 && !error.message.includes("fixture-secret"));
assert.equal(retries, 3);
for (const response of [() => new Response(null, { status: 401 }), () => Response.json({ code: 1012, info: context.token }), () => Response.json({ code: 60502 })]) {
  let count = 0;
  await assert.rejects(fetchInfoldCatalog(session, { ...options, fetchImpl: async () => { count++; return response(); } }), (error) => error.authInvalid && !error.message.includes(context.token));
  assert.equal(count, 1);
}
for (const response of [() => Response.json({ code: 123, info: context.token }), () => Response.json({ code: 0, data: encryptInfoldData({ product_list: [] }) }), () => new Response("not json"), () => new Response("x".repeat(2_000_001)), () => Response.json({ code: 0, data: encryptInfoldData({ ...fixture, pagination: { has_more: true } }) })]) {
  await assert.rejects(fetchInfoldCatalog(session, { ...options, fetchImpl: async () => response() }), (error) => !error.message.includes(context.token));
}
await assert.rejects(fetchInfoldCatalog({ cookie: "legacy" }, options), { authInvalid: true });

function database({ busy = false, existing = false, scope = null, gameName = "LOVE AND DEEPSPACE", failWrite = false } = {}) {
  const history = [];
  const client = {
    async query(sql, values) {
      history.push({ sql, values });
      if (sql.startsWith("SELECT * FROM gameinfo_russia_check_sources")) return { rows: [{ provider: "infold", game_id: 3, expected_game_name: "LOVE AND DEEPSPACE", catalog_scope_hash: scope }] };
      if (sql.startsWith("SELECT game")) return { rows: [{ game: gameName }] };
      if (sql.startsWith("SELECT 1 FROM gameinfo_russia_check_run_sources")) return { rowCount: Number(busy) };
      if (sql.startsWith("SELECT 1 FROM gameinfo_russia_check_items")) return { rowCount: Number(existing) };
      if (failWrite && sql.startsWith("UPDATE gameinfo_russia_check_sources")) throw Error("fixture DB failure");
      return { rows: [], rowCount: 1 };
    },
    release() { history.push({ sql: "RELEASE" }); },
  };
  return { history, async connect() { history.push({ sql: "CONNECT" }); return client; } };
}
const db = database();
const result = await saveInfoldSession(db, 2, { formData: capture() }, { id: 7 }, { fetchCatalog: async (input) => {
  assert.equal(db.history.length, 0);
  assert.deepEqual(input, session);
  return expected;
} });
assert.equal(result.authState, "verified");
assert.equal(result.verifiedPackCount, 2);
assert.doesNotMatch(JSON.stringify(result), /fixture-only-token|session_enc|scopeHash/);
const write = db.history.find(({ sql }) => sql.startsWith("INSERT INTO gameinfo_russia_check_source_credentials"));
assert.notEqual(write.values[1], JSON.stringify(session));
assert.deepEqual(JSON.parse(decryptRussiaCheckSession(write.values[1])), session);
assert.equal(write.values[3], 7);
assert.match(db.history.at(-3).sql, /enabled=true,catalog_scope_hash/);
assert.equal(db.history.at(-2).sql, "COMMIT");
assert.equal(db.history.at(-1).sql, "RELEASE");
assert.equal(db.history.some(({ sql }) => /^(INSERT INTO|UPDATE) gameinfo_russia_check_(items|events)/.test(sql)), false);
for (const failure of [async () => { throw Error("failed upstream"); }, async () => parseInfoldCatalog({ ...fixture, pagination: { has_more: true } })]) {
  const failedDb = database();
  await assert.rejects(saveInfoldSession(failedDb, 2, { formData: capture() }, {}, { fetchCatalog: failure }));
  assert.equal(failedDb.history.length, 0);
}
for (const config of [{ busy: true }, { existing: true, scope: "other-account" }, { gameName: "WRONG GAME" }]) {
  const failedDb = database(config);
  await assert.rejects(saveInfoldSession(failedDb, 2, { formData: capture() }, {}, { fetchCatalog: async () => expected }));
  assert.equal(failedDb.history.at(-2).sql, "ROLLBACK");
  assert.equal(failedDb.history.some(({ sql }) => sql.startsWith("INSERT")), false);
}
const rollbackDb = database({ failWrite: true });
await assert.rejects(saveInfoldSession(rollbackDb, 2, { formData: capture() }, {}, { fetchCatalog: async () => expected }));
assert.equal(rollbackDb.history.at(-2).sql, "ROLLBACK");
const rotateDb = database({ existing: true, scope: session.scopeHash });
await saveInfoldSession(rotateDb, 2, { formData: capture({ ...context, token: "rotated" }) }, {}, { fetchCatalog: async () => expected });
assert.equal(rotateDb.history.at(-2).sql, "COMMIT");
console.log(`${assertions} passed`);
