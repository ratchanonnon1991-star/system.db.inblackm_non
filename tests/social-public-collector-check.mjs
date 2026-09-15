import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const calls = [];
const tabs = [];
const event = { addListener() {} };
const localStore = { serverUrl: "https://tools.inblackm.com", ingestSecret: "x".repeat(32), collectorInstanceId: "reader" };
let runtimeListener;
let cookieReads = 0;
const context = vm.createContext({
  URL, AbortSignal, setTimeout, clearTimeout, crypto: { randomUUID: () => "reader" },
  chrome: {
    storage: { local: {
      get: async (keys) => typeof keys === "string" ? { [keys]: localStore[keys] } : { ...keys, ...localStore },
      set: async (values) => Object.assign(localStore, values),
      remove: async (key) => { delete localStore[key]; },
    } },
    offscreen: { hasDocument: async () => false, createDocument: async () => {}, closeDocument: async () => {} },
    runtime: { onInstalled: event, onMessage: { addListener(listener) { runtimeListener = listener; } }, sendMessage: async () => ({ status: "unknown", note: "public", posts: [] }) },
    alarms: { onAlarm: event, create: async () => {} }, cookies: { onChanged: event, getAll: async () => { cookieReads += 1; return [{ name: "c_user", value: "61553646485632" }]; } },
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
    return { ok: true, text: async () => "<html></html>", json: async () => url.includes("?instance=reader") ? { sources: [{ id: "1", url: "https://www.facebook.com/groups/123/about", groupId: "123" }], running: true } : { claimed: true } };
  },
});
vm.runInContext(fs.readFileSync("browser-extension/social-feed-collector/background.js", "utf8"), context);
const contentSource = fs.readFileSync("browser-extension/social-feed-collector/content.js", "utf8");
const backgroundSource = fs.readFileSync("browser-extension/social-feed-collector/background.js", "utf8");
const popupSource = fs.readFileSync("browser-extension/social-feed-collector/popup.js", "utf8");
assert.match(backgroundSource, /TOGGLE_FACEBOOK_LOGIN/);
assert.match(backgroundSource, /facebookAccountId/);
assert.match(backgroundSource, /clearPlatformAccountId/);
assert.match(backgroundSource, /if \(!await serverRunning\(\)\) \{ stopRequested = true; break; \}/, "an active collection loop must observe the server stop control");
assert.match(backgroundSource, /type:\s*"claim_comment"/, "collector must claim queued comment jobs");
assert.match(contentSource, /POST_FACEBOOK_COMMENT/, "Facebook content script must accept comment jobs");
assert.match(contentSource, /consecutiveExisting\s*>=\s*2/, "collector must stop at two consecutive posts already stored");
assert.match(contentSource, /progress\.seen\.has\(reference\.postId\)/, "the same rendered post must not count twice toward the stored-post boundary");
assert.match(contentSource, /privateGroupNeedsJoin\(\)/, "collector must detect private groups that still show a Join group control");
assert.match(backgroundSource, /credentials:\s*"omit"/);
assert.match(popupSource, /ใช้ Facebook ที่ล็อกอินอยู่/);
assert.match(contentSource, /see more\|ดูเพิ่มเติม/i);
assert.match(contentSource, /aria-label/);
assert.match(contentSource, /data-ad-preview/);
assert.doesNotMatch(contentSource, /const message = article\?\.innerText/);
const contentContext = vm.createContext({ URL, Date, Map, chrome: { runtime: { onMessage: event } } });
vm.runInContext(contentSource, contentContext);
contentContext.authorArticle = { querySelectorAll: (selector) => selector.includes('[role="button"]') || selector.includes('[aria-label]') ? [] : [{ textContent: "Anansit Sukthuayat" }] };
assert.equal(vm.runInContext("censoredAuthor(authorArticle)", contentContext), "A****** S*********", "author names keep only each word's first character and original length");
contentContext.timeAuthorArticle = { querySelectorAll: (selector) => selector.includes('[role="button"]') || selector.includes('[aria-label]') ? [] : [{ textContent: "7 นาที" }] };
assert.equal(vm.runInContext("censoredAuthor(timeAuthorArticle)", contentContext), "", "relative post times must never become author names");
contentContext.anonymousArticle = { querySelectorAll: (selector) => selector.includes('[role="button"]') ? [{ textContent: "ผู้มีส่วนร่วมที่ไม่ระบุตัวตน" }] : [] };
assert.equal(vm.runInContext("censoredAuthor(anonymousArticle)", contentContext), "ผู้มีส่วนร่วมที่ไม่ระบุตัวตน");
contentContext.actionArticle = { querySelectorAll: (selector) => selector.includes('[aria-label]') ? [{ getAttribute: () => "การดำเนินการสำหรับโพสต์นี้โดย Pheerasu Korsrisuwan" }] : [] };
assert.equal(vm.runInContext("censoredAuthor(actionArticle)", contentContext), "P******* K**********", "post action labels are the authoritative author source");
const parsedReference = vm.runInContext(`postReference(new URL("https://www.facebook.com/groups/832745976781717/?multi_permalinks=28173991072230505&hoisted_section_header_type=recently_seen"))`, contentContext);
assert.deepEqual({ ...parsedReference }, { groupId: "832745976781717", postId: "28173991072230505" });
const parsedDate = vm.runInContext(`parseFacebookDateLabel("30 กรกฎาคม", new Date(2026, 8, 14))`, contentContext);
assert.equal(parsedDate.getFullYear(), 2026);
assert.equal(parsedDate.getMonth(), 6);
assert.equal(parsedDate.getDate(), 30);
const augustDate = vm.runInContext(`parseFacebookDateLabel("13 สิงหาคม", new Date(2026, 8, 14))`, contentContext);
assert.equal(augustDate.getFullYear(), 2026);
assert.equal(augustDate.getMonth(), 7);
assert.equal(augustDate.getDate(), 13);
assert.equal(vm.runInContext(`parseFacebookDateLabel("๑๓ ส.ค.", new Date(2026, 8, 14))`, contentContext).getDate(), 13);
const relativeNow = new Date("2026-09-14T06:30:00.000Z");
const relativeDate = vm.runInContext(`parseFacebookDateLabel("4 นาที", new Date("${relativeNow.toISOString()}"))`, contentContext);
assert.equal(relativeDate.toISOString(), "2026-09-14T06:26:00.000Z");
assert.equal(vm.runInContext(`parseFacebookDateLabel("2 ชั่วโมง", new Date("${relativeNow.toISOString()}"))`, contentContext).toISOString(), "2026-09-14T04:30:00.000Z");
await vm.runInContext("Promise.all([runCheck(), runCheck()])", context);
const facebook = calls.filter(({ url }) => url.startsWith("https://www.facebook.com"));
assert.equal(facebook.length, 1, "public mode fetches Facebook HTML once");
assert.equal(facebook[0].url, "https://www.facebook.com/groups/123/", "public mode removes /about before reading");
assert.equal(facebook[0].options.credentials, "omit", "public mode must not attach Facebook cookies");
assert.equal(cookieReads, 0, "public collection must not inspect login cookies");
assert.equal(tabs.length, 0, "public mode must not open an authenticated browser tab");
assert.equal(calls.filter(({ url }) => url.includes("?instance=reader")).length, 2, "collector checks server control again before reading its assigned source");
assert.equal(calls.filter(({ url, options }) => url.endsWith("/api/social-feed/collector") && options.method === "POST" && JSON.parse(options.body).type === "heartbeat").length, 2, "worker refreshes heartbeat before claiming a source");
console.log("PASS: anonymous public fetch, overlapping-run guard, no login-cookie inspection");
const dispatch = (message) => new Promise((resolve) => runtimeListener(message, {}, resolve));
const linked = await dispatch({ type: "TOGGLE_FACEBOOK_LOGIN" });
assert.equal(linked.facebookAccountId, "61553646485632");
assert.equal(localStore.facebookAccountId, "61553646485632");
assert.equal(cookieReads, 1, "cookies are inspected only after explicit user action");
const facebookFetchesBeforeLoginScan = calls.filter(({ url }) => url.startsWith("https://www.facebook.com")).length;
await vm.runInContext('checkSources([{ id: "2", name: "private", url: "https://www.facebook.com/groups/456/about?ref=share", groupId: "456" }])', context);
assert.equal(tabs.filter((item) => item[0] === "create").length, 1);
assert.equal(tabs.find((item) => item[0] === "create")[1].active, false, "login mode opens an inactive tab");
assert.equal(tabs.filter((item) => item[0] === "update").length, 1);
assert.equal(tabs.find((item) => item[0] === "update")[2].url, "https://www.facebook.com/groups/456/", "login mode removes /about before opening the tab");
assert.equal(tabs.filter((item) => item[0] === "remove").length, 1);
assert.equal(calls.filter(({ url }) => url.startsWith("https://www.facebook.com")).length, facebookFetchesBeforeLoginScan, "login mode uses the rendered tab instead of anonymous fetch");
const unlinked = await dispatch({ type: "TOGGLE_FACEBOOK_LOGIN" });
assert.equal(unlinked.wasRemoved, true);
assert.equal(localStore.facebookAccountId, undefined);
const clearHeartbeat = calls.findLast(({ url, options }) => url.endsWith("/api/social-feed/collector") && options.method === "POST" && JSON.parse(options.body).clearPlatformAccountId);
assert.ok(clearHeartbeat, "unlink sends an explicit server-side account-id clear");
console.log("PASS: explicit Facebook account link and unlink");
const beforeDenied = tabs.length;
context.fetch = async () => ({ ok: true, json: async () => ({ claimed: false }) });
await vm.runInContext('checkSources([{ id: "1", url: "https://www.facebook.com/groups/123", groupId: "123" }])', context);
assert.equal(tabs.length, beforeDenied, "a denied work lease must never open or scan a tab");
console.log("PASS: denied lease skips browser work");
