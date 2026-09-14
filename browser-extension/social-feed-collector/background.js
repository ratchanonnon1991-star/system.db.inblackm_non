const DEFAULTS = { serverUrl: "https://tools.inblackm.com", accountLabel: "", ingestSecret: "" };
const randomBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function scanWithTimeout(tabId, source) {
  let timer;
  try {
    return await Promise.race([chrome.tabs.sendMessage(tabId, { type: "SCAN_FACEBOOK_GROUP", source }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("อ่านกลุ่มเกินเวลาที่กำหนด")), 45000); })]);
  } finally { clearTimeout(timer); }
}
const settings = () => chrome.storage.local.get(DEFAULTS);
async function instanceId() { const stored = await chrome.storage.local.get("collectorInstanceId"); if (stored.collectorInstanceId) return stored.collectorInstanceId; const id = crypto.randomUUID(); await chrome.storage.local.set({ collectorInstanceId: id }); return id; }
async function api(path, options = {}) { const config = await settings(); const response = await fetch(`${new URL(config.serverUrl).origin}${path}`, { signal: AbortSignal.timeout(15000), ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.ingestSecret}`, ...options.headers } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`); return body; }
async function currentFacebookId() { const cookies = await chrome.cookies.getAll({ domain: "facebook.com", name: "c_user" }); return cookies.find((cookie) => cookie.name === "c_user")?.value || ""; }
async function workerHeartbeat(status = "ready") { const config = await settings(); if (config.ingestSecret.length < 24) return null; const id = await instanceId(); const stored = await chrome.storage.local.get({ collectorLabel: "" }); const facebookId = await currentFacebookId(); return api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ type: "heartbeat", instanceId: id, label: stored.collectorLabel || config.accountLabel || `เครื่อง ${id.slice(0, 8)}`, platformAccountId: facebookId, status, activate: true }) }); }
async function report(sourceId, result) { await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ sourceId, instanceId: await instanceId(), status: result.status, note: result.note || "", ingested: result.ingested || 0 }) }); }
let currentCheck;
let stopRequested = false;
async function isPaused() { return (await chrome.storage.local.get({ paused: false })).paused; }
async function scheduleNextCheck() {
  if (await isPaused()) { await chrome.alarms.clear("social-feed-check"); await chrome.storage.local.remove("nextCheckAt"); return; }
  const { collectorRunning = false } = await chrome.storage.local.get({ collectorRunning: false });
  // กำลังอ่าน: สุ่มรอบ 4–7 นาที (เหมือนคน + heartbeat ไม่ขาดช่วงเกิน 10 นาที) / สแตนบาย: poll ทุก ~30 วิ เพื่อรับคำสั่ง "เริ่ม" จากเว็บได้เร็ว
  const nextCheckAt = Date.now() + (collectorRunning ? randomBetween(4 * 60 * 1000, 7 * 60 * 1000) : randomBetween(25 * 1000, 40 * 1000));
  await chrome.storage.local.set({ nextCheckAt });
  await chrome.alarms.create("social-feed-check", { when: nextCheckAt });
}
async function ensureTab(state) {
  if (state.id !== null) { try { await chrome.tabs.get(state.id); return state.id; } catch { state.id = null; } }
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  state.id = tab.id;
  return state.id;
}
async function checkSource(source, state) {
  try {
    const url = new URL(source.url);
    if (!["www.facebook.com", "facebook.com"].includes(url.hostname) || url.protocol !== "https:") throw new Error("URL กลุ่มไม่ถูกต้อง");
    let tabId = await ensureTab(state);
    await chrome.tabs.update(tabId, { url: url.href, active: false });
    const deadline = Date.now() + 45000;
    let result;
    while (Date.now() < deadline) {
      let tab;
      try { tab = await chrome.tabs.get(tabId); }
      catch { tabId = await ensureTab(state); await chrome.tabs.update(tabId, { url: url.href, active: false }); await new Promise((resolve) => setTimeout(resolve, 500)); continue; }
      if (tab.status === "complete") {
        try {
          await wait(randomBetween(1500, 4500)); // หน่วงเหมือนคนอ่านหน้าก่อนเลื่อนดู
          result = await scanWithTimeout(tabId, source);
          break;
        } catch (error) {
          if (/No tab with id/.test(error.message)) { tabId = await ensureTab(state); await chrome.tabs.update(tabId, { url: url.href, active: false }); }
          else if (!/Receiving end does not exist|Could not establish connection/.test(error.message)) throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!result) throw new Error("ตัวอ่านหน้า Public ไม่ตอบกลับ");
    const counts = result.posts?.length ? await api("/api/social-feed/ingest", { method: "POST", body: JSON.stringify({ posts: result.posts }) }) : { ingested: 0, existing: 0 };
    result.ingested = counts.ingested || 0;
    result.existing = counts.existing || 0;
    result.note += ` · เพิ่มใหม่ ${result.ingested} · มีแล้ว ${result.existing}`;
    await report(source.id, result);
    return { source: source.name, ...result };
  } catch (error) {
    const result = { status: "error", note: error.message };
    await report(source.id, result).catch(() => {});
    return { source: source.name, ...result };
  }
}
async function checkSources(sources) {
  if (!sources.length) return [];
  const state = { id: null };
  const results = [];
  let opened = 0;
  try {
    for (const source of sources) {
      if (stopRequested || await isPaused()) break;
      // เว้นช่วงเหมือนคนสลับดูทีละกลุ่ม (สุ่ม 8–25 วินาที) ไม่เปิดรัวติดกัน
      if (opened > 0) await wait(randomBetween(8000, 25000));
      if (stopRequested || await isPaused()) break;
      await workerHeartbeat();
      const claim = await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ type: "claim", sourceId: source.id, instanceId: await instanceId() }) });
      if (!claim.claimed) continue;
      const result = await checkSource(source, state);
      opened++;
      results.push(result);
      if (result.status === "checkpoint") { stopRequested = true; await chrome.storage.local.set({ paused: true }); await workerHeartbeat("checkpoint"); break; }
    }
    return results;
  } finally { if (state.id !== null) await chrome.tabs.remove(state.id).catch(() => {}); }
}
function runCheck() {
  if (currentCheck) return currentCheck;
  currentCheck = (async () => {
    stopRequested = false;
    const config = await settings();
    if (config.ingestSecret.length < 24) throw new Error("กรุณาตั้งค่า Ingest secret อย่างน้อย 24 ตัวอักษร");
    const id = await instanceId();
    await workerHeartbeat();
    const { sources = [], running = false } = await api(`/api/social-feed/collector?instance=${encodeURIComponent(id)}`);
    await chrome.storage.local.set({ collectorRunning: running });
    // ยังไม่กดเริ่มจากเว็บ = สแตนบาย: heartbeat แล้วรอ ไม่เปิดกลุ่มใด ๆ
    if (!running) return [];
    const results = await checkSources(sources);
    await chrome.storage.local.set({ lastCheckAt: new Date().toISOString(), lastResults: results });
    return results;
  })().finally(async () => { currentCheck = null; await scheduleNextCheck(); });
  return currentCheck;
}
chrome.runtime.onInstalled.addListener(async () => { await instanceId(); await scheduleNextCheck(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name !== "social-feed-check") return; isPaused().then((paused) => { if (!paused) runCheck().catch(() => workerHeartbeat().catch(() => {})); }); });
chrome.cookies.onChanged.addListener((info) => { if (info.cookie?.name !== "c_user" || !String(info.cookie.domain).endsWith("facebook.com")) return; if (info.removed) { workerHeartbeat("logged_out").catch(() => {}); return; } setTimeout(() => workerHeartbeat().catch(() => {}), 1200); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { if (message.type === "PARSE_PUBLIC_SOCIAL_HTML") return; (async () => { if (message.type === "RUN_SOCIAL_FEED_CHECK") return { ok: true, results: await runCheck() }; if (message.type === "SET_SOCIAL_FEED_PAUSED") { const paused = Boolean(message.paused); await chrome.storage.local.set({ paused }); if (paused) { stopRequested = true; await chrome.alarms.clear("social-feed-check"); await chrome.storage.local.remove("nextCheckAt"); await workerHeartbeat("offline").catch(() => {}); } else { stopRequested = false; await workerHeartbeat().catch(() => {}); await scheduleNextCheck(); } return { ok: true, paused }; } throw new Error("ไม่อนุญาตคำขอนี้"); })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message })); return true; });
