import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const calls = [];
const event = { addListener() {} };
const context = vm.createContext({
  URL, AbortSignal, setTimeout, clearTimeout, crypto: { randomUUID: () => "reader" },
  chrome: {
    storage: { local: { get: async () => ({ serverUrl: "https://tools.inblackm.com", ingestSecret: "x".repeat(32), collectorInstanceId: "reader" }), set: async () => {} } },
    offscreen: { hasDocument: async () => false, createDocument: async () => {}, closeDocument: async () => {} },
    runtime: { onInstalled: event, onMessage: event, sendMessage: async () => ({ status: "unknown", posts: [] }) },
    alarms: { onAlarm: event, create: async () => {} }, cookies: { onChanged: event, getAll: () => { throw new Error("Collection must not read login cookies"); } },
    tabs: { onRemoved: event, create: () => { throw new Error("Collection must not open tabs"); } },
  },
  fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => "<html></html>", json: async () => url.includes("?mode=public") ? { sources: [{ id: "1", url: "https://www.facebook.com/groups/123", groupId: "123" }] } : {} };
  },
});
vm.runInContext(fs.readFileSync("browser-extension/social-feed-collector/background.js", "utf8"), context);
await vm.runInContext("Promise.all([runCheck(), runCheck()])", context);
const facebook = calls.filter(({ url }) => url.startsWith("https://www.facebook.com"));
assert.equal(facebook.length, 1, "Overlapping runs must share one collection");
assert.equal(facebook[0].options.credentials, "omit");
assert.equal(calls.filter(({ url }) => url.includes("?mode=public")).length, 1);
console.log("PASS: no-login collection, no tabs, cookie omission, overlapping-run guard");
