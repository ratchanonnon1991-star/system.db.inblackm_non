import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchMidasbuyCatalog, parseMidasbuyPage, MIDASBUY_CATALOG_URL } from "../src/server/gameinfo-midasbuy-catalog.js";
import { getRussiaCheckSourceAvailability } from "../src/lib/gameinfo-russia-check-source.js";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const fixture = JSON.parse(readFileSync(new URL("./fixtures/midasbuy-nikke-th.json", import.meta.url), "utf8"));
const source = { provider: "midasbuy", project_id: "1460000285", country: "TH", locale: "en" };
const retryDelay = async () => {};
const from = (payload) => fetchMidasbuyCatalog(source, { fetchImpl: async () => Response.json(payload), retryDelay });
const copy = () => structuredClone(fixture);
const catalog = await from(fixture);
assert.equal(catalog.length, 9);
assert.ok(catalog.some((p) => p.name === "Monthly pass"));
assert.ok(catalog.every((p) => Object.keys(p).sort().join() === "name,sku"));
const availability = getRussiaCheckSourceAvailability({ ...source, authRequired: false, sourceEnabled: true });
assert.equal(availability.authState, "not_required");
assert.equal(availability.refreshBlockedReason, "");

// New category / names do not need a local allowlist; do not collect bundle children.
const extra = copy();
extra.shelf.products.push({ ...extra.shelf.products[0], product_id: "new-category-pack", name: "  Ｎｅｗ   Pack  ", base_group: "future-category", bundle_items: [{ product_id: "child", name: "Not a pack" }] });
assert.equal((await from(extra)).length, 10);
assert.equal((await from(extra)).find((p) => p.sku === "new-category-pack").name, "New Pack");
const unavailable = copy();
unavailable.shelf.products[0].available_channel_ids = [];
assert.equal((await from(unavailable)).length, 8);

// Pagination follows the provider cursor, keeping region and anonymous scope.
let calls = [];
const first = copy();
first.shelf.products = first.shelf.products.slice(0, 4);
first.shelf.product_offset = "next-page";
const second = copy();
second.shelf.products = second.shelf.products.slice(4);
assert.deepEqual(await fetchMidasbuyCatalog(source, { retryDelay, fetchImpl: async (url, init) => {
  calls.push(JSON.parse(init.body));
  assert.equal(url, MIDASBUY_CATALOG_URL);
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  assert.equal(Object.keys(init.headers).some((k) => /cookie|authorization/i.test(k)), false);
  return Response.json(calls.length === 1 ? first : second);
} }), catalog);
assert.equal(calls.length, 2);
assert.equal(calls[0].product_offset, undefined);
assert.equal(calls[1].product_offset, "next-page");
for (const body of calls) {
  assert.equal(body.region, "TH");
  assert.equal(body.language, "en");
  assert.equal(body.app_id, "1460000285");
  assert.equal(body.game_openid, "");
  assert.equal(body.mid, "");
  assert.equal(body.filter_menu, undefined);
  assert.equal(body.tab_lab, "");
  assert.deepEqual(body.product_types, ["Rp", "Subscription"]);
}

for (const mutate of [
  (p) => { delete p.shelf; },
  (p) => { p.shelf.app_id = "wrong-game"; },
  (p) => { p.shelf.products = []; },
  (p) => { delete p.shelf.product_offset; },
  (p) => { p.shelf.is_part_activity_fail = true; },
  (p) => { p.shelf.is_channel_activity_fail = true; },
  (p) => { p.shelf.loss_level = "degraded"; },
  (p) => { p.shelf.products[0].name = " "; },
  (p) => { p.shelf.products[0].name = {}; },
  (p) => { p.shelf.products[0].product_id = " "; },
  (p) => { p.shelf.products[0].region = "RU"; },
  (p) => { p.shelf.products[0].app_id = "wrong"; },
  (p) => { p.shelf.products[0].isMaintaining = true; },
  (p) => { delete p.shelf.products[0].available_channel_ids; },
  (p) => { p.shelf.products.push(p.shelf.products[0]); },
  (p) => { p.shelf.products.forEach((item) => { item.available_channel_ids = []; }); },
]) {
  const payload = copy(); mutate(payload);
  await assert.rejects(from(payload), /Midasbuy/);
}
assert.throws(() => parseMidasbuyPage(fixture, { ...source, project_id: "" }), /ตั้งค่า/);
await assert.rejects(fetchMidasbuyCatalog(source, { retryDelay, fetchImpl: async () => Response.json(first) }), /ซ้ำ/);
calls = [];
await assert.rejects(fetchMidasbuyCatalog(source, { retryDelay, fetchImpl: async () => {
  calls.push(1);
  if (calls.length === 1) return Response.json(first);
  return new Response("unavailable", { status: 503 });
} }), /HTTP 503/);
assert.equal(calls.length, 4); // First page plus 3 attempts on second page.
let attempts = 0;
assert.equal((await fetchMidasbuyCatalog(source, { retryDelay, fetchImpl: async () => {
  attempts++;
  if (attempts === 1) throw Error("network error with private upstream details");
  if (attempts === 2) return new Response("rate limit", { status: 429 });
  return Response.json(fixture);
} })).length, 9);
assert.equal(attempts, 3);
for (const response of [new Response("auth required", { status: 401 }), new Response("<html>broken</html>"), new Response("x", { headers: { "content-length": String(5 * 1024 * 1024) } })]) {
  attempts = 0;
  await assert.rejects(fetchMidasbuyCatalog(source, { retryDelay, fetchImpl: async () => { attempts++; return response; } }), /Midasbuy/);
  assert.equal(attempts, 1);
}
console.log(`${assertions} passed`);
