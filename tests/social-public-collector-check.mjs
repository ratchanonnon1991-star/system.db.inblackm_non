import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const calls = [];
const tabs = [];
let claimCount = 0;
const event = { addListener() {} };
const context = vm.createContext({
  URL, AbortSignal, setTimeout, clearTimeout, crypto: { randomUUID: () => "reader" },
  chrome: {
    storage: { local: { get: async () => ({ serverUrl: "https://tools.inblackm.com", ingestSecret: "x".repeat(32), collectorInstanceId: "reader" }), set: async () => {} } },
    offscreen: { hasDocument: async () => false, createDocument: async () => {}, closeDocument: async () => {} },
    runtime: { onInstalled: event, onMessage: event, sendMessage: async () => ({ status: "unknown", posts: [] }) },
    alarms: { onAlarm: event, create: async () => {} }, cookies: { onChanged: event, getAll: () => { throw new Error("Collection must not read login cookies"); } },
    tabs: {
      onRemoved: event,
      create: async (options) => { tabs.push(["create", options]); return { id: 7 }; },
      update: async (id, options) => { tabs.push(["update", id, options]); },
      get: async () => ({ status: "complete" }),
      sendMessage: async () => ({ status: "ready", note: "read", posts: [] }),
      remove: async (id) => { tabs.push(["remove", id]); },
    },
  },
  fetch: async (url, options) => {
    calls.push({ url, options });
    const claimed = url.includes("claim=1") && claimCount++ === 0;
    return { ok: true, text: async () => "<html></html>", json: async () => claimed ? { sources: [{ id: "1", url: "https://www.facebook.com/groups/123", groupId: "123" }] } : { sources: [] } };
  },
});
vm.runInContext(fs.readFileSync("browser-extension/social-feed-collector/background.js", "utf8"), context);
const contentSource = fs.readFileSync("browser-extension/social-feed-collector/content.js", "utf8");
assert.match(contentSource, /see more\|ดูเพิ่มเติม/i);
assert.match(contentSource, /data-ad-preview/);
assert.doesNotMatch(contentSource, /const message = article\?\.innerText/);
await vm.runInContext("Promise.all([runCheck(), runCheck()])", context);
const facebook = calls.filter(({ url }) => url.startsWith("https://www.facebook.com"));
assert.equal(facebook.length, 0, "Facebook is read through the rendered tab");
assert.equal(tabs.filter((item) => item[0] === "create").length, 1);
assert.equal(tabs[0][1].active, false);
assert.equal(tabs.filter((item) => item[0] === "update").length, 1);
assert.equal(tabs.filter((item) => item[0] === "remove").length, 1);
assert.equal(calls.filter(({ url }) => url.includes("claim=1") && url.includes("instance=reader")).length, 2);
const repositorySource = fs.readFileSync("src/server/social-feed-repository.js", "utf8");
assert.match(repositorySource, /FOR UPDATE SKIP LOCKED LIMIT 1/);
assert.match(repositorySource, /collector_lease_until=NOW\(\)\+INTERVAL '2 minutes'/);
assert.match(repositorySource, /next_scan_at=NOW\(\)\+CASE/);
console.log("PASS: distributed source claim, one inactive tab, lease cleanup, overlapping-run guard");
