import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchSkystoneCatalog, parseSkystoneGoods, SKYSTONE_PAY_CHANNEL } from "../src/server/gameinfo-skystone-catalog.js";
import { getRussiaCheckSourceAvailability } from "../src/lib/gameinfo-russia-check-source.js";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const fixture = JSON.parse(readFileSync(new URL("./fixtures/skystone-crystal-of-atlan-us.json", import.meta.url), "utf8"));
const source = { provider: "skystone", source_url: "https://topup.games.skystone.games", project_id: "754024", country: "US", locale: "en" };
const retryDelay = async () => {};
const from = (payload) => fetchSkystoneCatalog(source, { fetchImpl: async () => Response.json(payload), retryDelay });
const copy = () => structuredClone(fixture);
const catalog = await from(fixture);
assert.equal(catalog.length, 21);
assert.ok(catalog.some((pack) => pack.name === "60 Vouchers + 5 Bonus"));
assert.ok(catalog.every((pack) => Object.keys(pack).sort().join() === "name,sku"));
assert.deepEqual(catalog.map((pack) => pack.sku), [...catalog.map((pack) => pack.sku)].sort((a, b) => a.localeCompare(b)));
const availability = getRussiaCheckSourceAvailability({ ...source, authRequired: false, sourceEnabled: true });
assert.equal(availability.catalogSupported, true);
assert.equal(availability.authState, "not_required");
assert.equal(availability.refreshBlockedReason, "");

// The anonymous request is the one the storefront sends: no account, no cookies.
let calls = [];
await fetchSkystoneCatalog(source, { retryDelay, fetchImpl: async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) });
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  assert.equal(Object.keys(init.headers).some((key) => /cookie|authorization/i.test(key)), false);
  return Response.json(fixture);
} });
assert.equal(calls[0].url, "https://topup.games.skystone.games/web/payment/app/754024/country/US/all_goods_detail");
assert.equal(calls[0].init.method, "POST");
assert.deepEqual(calls[0].body, { country: "US", role_id: "", pay_channel: SKYSTONE_PAY_CHANNEL, aid: 754024 });

// Limited-time packs count, unbuyable ones do not, and a repeated pack is not a duplicate.
const withActivity = copy();
withActivity.data.activity = [
  { goods_type: 3, product_id: "us.coa.festival", product_name: "  Ｆｅｓｔｉｖａｌ   Bundle  ", channels: ["xsolla_paystation"] },
  { ...withActivity.data.normal[0] },
];
assert.equal((await from(withActivity)).length, 22);
assert.equal((await from(withActivity)).find((pack) => pack.sku === "us.coa.festival").name, "Festival Bundle");
const soldOut = copy();
soldOut.data.normal[0].channels = [];
assert.equal((await from(soldOut)).length, 20);
// Regrouped copies of the same packs are ignored; `normal` stays the source of truth.
const classified = copy();
classified.data.classify_products = { Voucher: classified.data.normal };
assert.equal((await from(classified)).length, 21);

for (const mutate of [
  (p) => { p.code = -30303; delete p.data; },
  (p) => { p.code = 0; p.data = null; },
  (p) => { p.data.normal = []; },
  (p) => { p.data.normal = {}; },
  (p) => { p.data.activity = "none"; },
  (p) => { p.data.normal[0].product_id = " "; },
  (p) => { p.data.normal[0].product_name = " "; },
  (p) => { p.data.normal[0].product_name = {}; },
  (p) => { delete p.data.normal[0].goods_type; },
  (p) => { delete p.data.normal[0].channels; },
  (p) => { p.data.normal[0].channels = [""]; },
  (p) => { p.data.normal.forEach((pack) => { pack.channels = []; }); },
  (p) => { p.data.activity = [{ ...p.data.normal[0], product_name: "Renamed copy" }]; },
]) {
  const payload = copy(); mutate(payload);
  await assert.rejects(from(payload), /Skystone/);
}
for (const broken of [{ ...source, project_id: "" }, { ...source, country: "usa" }, { ...source, source_url: "https://topup.example.com" }, { ...source, source_url: "http://topup.games.skystone.games" }]) {
  assert.throws(() => parseSkystoneGoods(fixture, broken), /Skystone/);
}

// Transport: retry transient failures, never retry a rejection the store means.
let attempts = 0;
assert.equal((await fetchSkystoneCatalog(source, { retryDelay, fetchImpl: async () => {
  attempts++;
  if (attempts === 1) throw Error("network error with private upstream details");
  if (attempts === 2) return new Response("rate limit", { status: 429 });
  return Response.json(fixture);
} })).length, 21);
assert.equal(attempts, 3);
attempts = 0;
await assert.rejects(fetchSkystoneCatalog(source, { retryDelay, fetchImpl: async () => { attempts++; return new Response("unavailable", { status: 503 }); } }), /HTTP 503/);
assert.equal(attempts, 3);
for (const response of [new Response("auth required", { status: 401 }), new Response("<html>broken</html>"), new Response("x", { headers: { "content-length": String(5 * 1024 * 1024) } })]) {
  attempts = 0;
  await assert.rejects(fetchSkystoneCatalog(source, { retryDelay, fetchImpl: async () => { attempts++; return response; } }), /Skystone/);
  assert.equal(attempts, 1);
}
console.log(`${assertions} passed`);
