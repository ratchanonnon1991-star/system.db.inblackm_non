const DEFAULTS = { serverUrl: "https://tools.inblackm.com", accountLabel: "", ingestSecret: "" };
const settings = () => chrome.storage.local.get(DEFAULTS);
async function instanceId() { const stored = await chrome.storage.local.get("collectorInstanceId"); if (stored.collectorInstanceId) return stored.collectorInstanceId; const id = crypto.randomUUID(); await chrome.storage.local.set({ collectorInstanceId: id }); return id; }
async function api(path, options = {}) { const config = await settings(); const response = await fetch(`${new URL(config.serverUrl).origin}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.ingestSecret}`, ...options.headers } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`); return body; }
async function currentFacebookId() { const cookies = await chrome.cookies.getAll({ domain: "facebook.com", name: "c_user" }); return cookies.find((cookie) => cookie.name === "c_user")?.value || ""; }
async function heartbeat({ activate = false, forcedStatus = "" } = {}) { const config = await settings(); if (!config.accountLabel || config.ingestSecret.length < 24) return null; const facebookId = await currentFacebookId(); const status = forcedStatus || (facebookId ? "ready" : "logged_out"); const result = await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ type: "heartbeat", instanceId: await instanceId(), label: config.accountLabel, platformAccountId: facebookId, status, activate }) }); await chrome.storage.local.set({ lastHeartbeatAt: new Date().toISOString(), lastFacebookId: facebookId || (await chrome.storage.local.get("lastFacebookId")).lastFacebookId || "" }); return result; }
async function report(sourceId, result) { await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ sourceId, instanceId: await instanceId(), status: result.status, note: result.note || "" }) }); }
async function beginLogin({ label, targetInstanceId = "" }) { const ownInstanceId = await instanceId(); if (targetInstanceId && targetInstanceId !== ownInstanceId) throw new Error("กรุณาเปิดหน้านี้ใน Chrome profile ของบัญชีที่เลือก"); const previous = (await chrome.storage.session.get("loginFlow")).loginFlow; if (previous && previous.expiresAt > Date.now()) throw new Error("มีหน้าต่าง Login เปิดอยู่แล้ว"); if (previous) await chrome.storage.session.remove("loginFlow"); await chrome.storage.local.set({ accountLabel: String(label || "").trim().slice(0, 100) }); const popup = await chrome.windows.create({ url: "about:blank", type: "popup", width: 540, height: 680, focused: true }); const popupTabId = popup.tabs?.[0]?.id; if (!Number.isInteger(popupTabId)) throw new Error("เปิดหน้าต่าง Login ไม่สำเร็จ"); await chrome.storage.session.set({ loginFlow: { label, popupTabId, windowId: popup.id, status: "confirming", expiresAt: Date.now() + 600000 } }); await chrome.tabs.update(popupTabId, { url: chrome.runtime.getURL("login.html") }); }
async function finishLogin(flow) { const facebookId = await currentFacebookId(); if (!facebookId) return; await heartbeat({ activate: true }); await chrome.storage.session.remove("loginFlow"); await chrome.windows.remove(flow.windowId).catch(() => {}); }
let currentCheck;
async function checkSource(source) {
  try {
    const url = new URL(source.url);
    if (!["www.facebook.com", "facebook.com"].includes(url.hostname) || url.protocol !== "https:") throw new Error("URL กลุ่มไม่ถูกต้อง");
    const response = await fetch(url.href, { credentials: "omit", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Facebook HTTP ${response.status}`);
    const result = await chrome.runtime.sendMessage({ type: "PARSE_PUBLIC_SOCIAL_HTML", html: await response.text(), source });
    if (!result) throw new Error("ตัวอ่านหน้า Public ไม่ตอบกลับ");
    await report(source.id, result);
    if (result.posts?.length) await api("/api/social-feed/ingest", { method: "POST", body: JSON.stringify({ posts: result.posts }) });
    return { source: source.name, ...result };
  } catch (error) {
    const result = { status: "error", note: error.message };
    await report(source.id, result).catch(() => {});
    return { source: source.name, ...result };
  }
}
async function checkSources(sources, concurrency = 3) {
  const results = new Array(sources.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < sources.length) {
      const index = nextIndex++;
      results[index] = await checkSource(sources[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, () => worker()));
  return results;
}
function runCheck() {
  if (currentCheck) return currentCheck;
  currentCheck = (async () => {
    const config = await settings();
    if (config.ingestSecret.length < 24) throw new Error("กรุณาตั้งค่า Ingest secret อย่างน้อย 24 ตัวอักษร");
    const { sources = [] } = await api("/api/social-feed/collector?mode=public");
    try {
      if (!await chrome.offscreen.hasDocument()) await chrome.offscreen.createDocument({ url: "public-reader.html", reasons: ["DOM_PARSER"], justification: "อ่านข้อความจาก HTML สาธารณะโดยไม่ใช้ Facebook session" });
      const results = await checkSources(sources);
      await chrome.storage.local.set({ lastCheckAt: new Date().toISOString(), lastResults: results });
      return results;
    } finally { await chrome.offscreen.closeDocument().catch(() => {}); }
  })().finally(() => { currentCheck = null; });
  return currentCheck;
}
chrome.runtime.onInstalled.addListener(async () => { await instanceId(); chrome.alarms.create("social-feed-check", { periodInMinutes: 5 }); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "social-feed-check") runCheck().catch(() => heartbeat().catch(() => {})); });
chrome.cookies.onChanged.addListener((info) => { if (info.cookie?.name !== "c_user" || !String(info.cookie.domain).endsWith("facebook.com")) return; if (info.removed) { heartbeat({ forcedStatus: "logged_out" }).catch(() => {}); return; } setTimeout(async () => { const flow = (await chrome.storage.session.get("loginFlow")).loginFlow; if (flow?.status === "waiting") finishLogin(flow).catch(() => {}); else heartbeat().catch(() => {}); }, 1200); });
chrome.tabs.onRemoved.addListener(async (tabId) => { const flow = (await chrome.storage.session.get("loginFlow")).loginFlow; if (flow?.popupTabId === tabId) await chrome.storage.session.remove("loginFlow"); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { if (message.type === "PARSE_PUBLIC_SOCIAL_HTML") return; (async () => { if (message.type === "RUN_SOCIAL_FEED_CHECK") return { ok: true, results: await runCheck() }; if (message.type === "BEGIN_FACEBOOK_LOGIN") { await beginLogin(message); return { ok: true }; } const flow = (await chrome.storage.session.get("loginFlow")).loginFlow; const fromLogin = flow && sender.id === chrome.runtime.id && sender.tab?.id === flow.popupTabId && sender.url === chrome.runtime.getURL("login.html"); if (message.type === "LOGIN_DESCRIBE" && fromLogin) return { label: flow.label, currentFacebookId: await currentFacebookId() }; if (message.type === "LOGIN_USE_CURRENT" && fromLogin) { if (await currentFacebookId()) await finishLogin(flow); else { await chrome.storage.session.set({ loginFlow: { ...flow, status: "waiting" } }); await chrome.tabs.update(flow.popupTabId, { url: "https://www.facebook.com/login/" }); } return { ok: true }; } if (message.type === "LOGIN_FRESH" && fromLogin) { await chrome.browsingData.remove({ origins: ["https://www.facebook.com", "https://facebook.com"] }, { cookies: true, localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true }); await chrome.storage.session.set({ loginFlow: { ...flow, status: "waiting" } }); await chrome.tabs.update(flow.popupTabId, { url: "https://www.facebook.com/login/" }); return { ok: true }; } throw new Error("ไม่อนุญาตคำขอนี้"); })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message })); return true; });
