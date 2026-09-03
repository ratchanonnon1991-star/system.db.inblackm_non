import strict from "node:assert/strict";
import { createConnector } from "../extensions/russia-check/connector.js";
import { capturedForm, isAppUrl, PRODUCTS_URL, STORE_URL } from "../extensions/russia-check/protocol.js";
import { buildRussiaCheckExtension, extensionManifest } from "@/server/gameinfo-russia-check-extension";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const origin = "https://gameinfo.fixture.test";
const manifest = extensionManifest(origin);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.minimum_chrome_version, "120");
assert.deepEqual(manifest.permissions, ["webRequest", "storage", "alarms"]);
assert.equal(manifest.host_permissions.length, 5);
assert.equal(manifest.host_permissions.some((url) => url.includes("*://") || url.includes("*.")), false);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.web_accessible_resources, undefined);
for (const value of ["http://example.com", "https://example.com/path", "https://user:pass@example.com", "file:///tmp", "https://example.com?origin=evil"]) assert.throws(() => extensionManifest(value));
assert.ok(extensionManifest("http://localhost:4183"));
assert.ok(isAppUrl(`${origin}/gameinfo/th/russia-check`, origin));
assert.ok(isAppUrl(`${origin}/gameinfo/en/russia-check/extension`, origin));
assert.equal(isAppUrl(`${origin}.evil/gameinfo/th/russia-check`, origin), false);
assert.equal(isAppUrl(`${origin}/gameinfo/th/russia-check/other`, origin), false);
assert.equal(isAppUrl("http://localhost:4184/gameinfo/th/russia-check", "http://localhost:4183"), false);
const zip = Buffer.from(await (await buildRussiaCheckExtension(origin)).arrayBuffer());
const files = {};
let offset = 0;
while (zip.readUInt32LE(offset) === 0x04034b50) {
  const size = zip.readUInt32LE(offset + 18);
  const length = zip.readUInt16LE(offset + 26);
  const name = zip.subarray(offset + 30, offset + 30 + length).toString();
  assert.equal(zip.readUInt16LE(offset + 8), 0);
  files[name] = zip.subarray(offset + 30 + length, offset + 30 + length + size).toString();
  offset += 30 + length + size;
}
assert.equal(zip.readUInt32LE(offset), 0x02014b50);
assert.equal(zip.readUInt16LE(zip.length - 12), 10);
assert.equal(Object.keys(files).length, 10);
assert.deepEqual(JSON.parse(files["manifest.json"]), manifest);
assert.match(files["config.js"], /gameinfo\.fixture\.test/);
assert.equal(Object.keys(files).some((name) => name.includes("..") || name.startsWith(".")), false);
for (const script of [...manifest.content_scripts[0].js, manifest.background.service_worker, "confirm.js", "connector.js", "protocol.js"]) assert.ok(files[script]);

const form = { app_id: ["1010001"], timestamp: ["1900000000"], sign_type: ["hmac"], clientid: ["1067"], lang: ["en"], data: ["fixture-secret-data"], sign: ["fixture-sign"] };
function harness() {
  let clock = 1000;
  let storage = {};
  const sent = [], closed = [], navigated = [];
  const api = {
    runtime: { id: "test-extension", getURL: (name) => `chrome-extension://test-extension/${name}` },
    storage: { session: {
      get: async () => structuredClone(storage),
      set: async (value) => { storage = structuredClone(value); },
      remove: async (key) => { delete storage[key]; },
    } },
    windows: { create: async () => ({ id: 20, tabs: [{ id: 30 }] }) },
    tabs: {
      remove: async (id) => { closed.push(id); },
      update: async (id, value) => { navigated.push({ id, ...value }); },
      sendMessage: async (...args) => { sent.push(args); return { accepted: true }; },
    },
    alarms: { create: async () => {}, clear: async () => {} },
  };
  const options = { now: () => clock, uuid: () => "private-flow-id" };
  const connector = createConnector(api, { origin }, options);
  const app = { id: api.runtime.id, tab: { id: 10 }, documentId: "document-one", frameId: 0, url: `${origin}/gameinfo/th/russia-check` };
  const consent = { id: api.runtime.id, tab: { id: 30 }, frameId: 0, url: api.runtime.getURL("confirm.html") };
  const details = { tabId: 30, method: "POST", url: PRODUCTS_URL, initiator: new URL(STORE_URL).origin, requestBody: { formData: form } };
  return { connector, api, app, consent, details, sent, closed, navigated, options,
    state: () => storage.connection, advance: (ms) => { clock += ms; },
    async begin() { await connector.message({ action: "begin", sourceId: 2 }, app); },
    async approve() { await connector.message({ action: "approve" }, consent); },
  };
}
const h = harness();
await assert.rejects(h.connector.message({ action: "ping" }, { ...h.app, url: "https://evil.test/gameinfo/th/russia-check" }));
await assert.rejects(h.connector.message({ action: "ping" }, { ...h.app, frameId: 1 }));
await assert.rejects(h.connector.message({ action: "begin", sourceId: "2" }, h.app));
assert.equal((await h.connector.message({ action: "ping" }, h.app)).version, "1.1.0");
await h.begin();
assert.equal(h.state().status, "confirming");
assert.equal(capturedForm(h.details, h.state(), 1000), null);
await assert.rejects(h.connector.message({ action: "begin", sourceId: 2 }, h.app));
await assert.rejects(h.connector.message({ action: "approve" }, h.app));
await assert.rejects(h.connector.message({ action: "approve" }, { ...h.consent, tab: { id: 999 } }));
await h.approve();
assert.equal(h.navigated[0].url, STORE_URL);
assert.equal(h.state().status, "waiting");
for (const patch of [{ tabId: 999 }, { method: "GET" }, { url: `${PRODUCTS_URL}/other` }, { initiator: "https://evil.test" }, { requestBody: { formData: { ...form, token: ["leak"] } } }, { requestBody: { formData: { ...form, data: ["one", "two"] } } }, { requestBody: { formData: { ...form, app_id: ["other"] } } }]) {
  assert.equal(capturedForm({ ...h.details, ...patch }, h.state(), 1000), null);
}
const raw = new TextEncoder().encode(new URLSearchParams(Object.fromEntries(Object.entries(form).map(([key, values]) => [key, values[0]]))).toString());
assert.ok(capturedForm({ ...h.details, requestBody: { raw: [{ bytes: raw.buffer }] } }, h.state(), 1000));
assert.equal(capturedForm({ ...h.details, requestBody: { raw: [{ file: "not-readable" }] } }, h.state(), 1000), null);
const resumed = createConnector(h.api, { origin }, h.options);
await Promise.all([resumed.capture(h.details), resumed.capture(h.details)]);
assert.equal(h.sent.length, 1);
assert.equal(h.state().status, "submitting");
assert.deepEqual(h.sent[0][2], { documentId: "document-one" });
assert.doesNotMatch(JSON.stringify(h.state()), /fixture-secret|fixture-sign|formData/);
assert.doesNotMatch(JSON.stringify(await resumed.message({ action: "status" }, h.app)), /flowId|document-one|fixture-secret/);
assert.equal((await resumed.message({ action: "status" }, { ...h.app, documentId: "other" })).status, "idle");
await assert.rejects(resumed.message({ action: "complete", flowId: "wrong", ok: true, packCount: 3 }, h.app));
await assert.rejects(resumed.message({ action: "cancel" }, h.app));
await resumed.message({ action: "complete", flowId: "private-flow-id", ok: false, retryLogin: true }, h.app);
assert.equal(h.state().status, "waiting");
await resumed.capture(h.details);
await resumed.message({ action: "complete", flowId: "private-flow-id", ok: true, packCount: 3 }, h.app);
assert.equal(h.state().status, "completed");
assert.deepEqual(h.closed, [30]);
await resumed.capture(h.details);
assert.equal(h.sent.length, 2);
await assert.rejects(resumed.message({ action: "complete", flowId: "private-flow-id", ok: true, packCount: 3 }, h.app));
h.advance(600001);
await resumed.tick();
assert.equal(h.state(), undefined);
for (const action of ["cancel", "close", "expire", "failed", "lost-page"]) {
  const case_ = harness();
  await case_.begin();
  await case_.approve();
  if (action === "cancel") await case_.connector.message({ action }, case_.app);
  if (action === "close") await case_.connector.tabClosed(30);
  if (action === "expire") { case_.advance(600001); await case_.connector.tick(); }
  if (action === "failed") { await case_.connector.capture(case_.details); await case_.connector.message({ action: "complete", flowId: "private-flow-id", ok: false, error: "fixture failure" }, case_.app); }
  if (action === "lost-page") { case_.api.tabs.sendMessage = async () => { throw Error(); }; await case_.connector.capture(case_.details); }
  assert.equal(["cancelled", "expired", "failed"].includes(case_.state().status), true);
  assert.ok(case_.closed.includes(30));
}
const gryph = harness();
await assert.rejects(gryph.connector.message({ action: "begin", sourceId: 5, provider: "unknown" }, gryph.app));
assert.ok((await gryph.connector.message({ action: "ping" }, gryph.app)).providers.includes("gryphline"));
await gryph.connector.message({ action: "begin", sourceId: 5, provider: "gryphline" }, gryph.app);
assert.equal((await gryph.connector.message({ action: "describe" }, gryph.consent)).gameName, "ARKNIGHTS: ENDFIELD");
await gryph.approve();
assert.equal(gryph.navigated[0].url, "https://topup.gryphline.com/endfield");
await gryph.connector.capture(gryph.details); // An Infold request must not cross providers.
assert.equal(gryph.sent.length, 0);
const gryphUrl = "https://as.gryphline.com/user/pay/v3/query_web_product?token=Zml4dHVyZQ%3D%3D&appCode=d9f6dbb6bbd6bb33&serverId=1";
await gryph.connector.capture({ tabId: 30, method: "GET", initiator: "https://topup.gryphline.com", url: gryphUrl });
assert.equal(gryph.sent[0][1].formData, gryphUrl);
assert.doesNotMatch(JSON.stringify(gryph.state()), /Zml4dHVyZQ|query_web_product/);
await gryph.connector.message({ action: "complete", flowId: "private-flow-id", ok: true, packCount: 2 }, gryph.app);
assert.equal(gryph.state().status, "completed");
console.log(`${assertions} passed`);
