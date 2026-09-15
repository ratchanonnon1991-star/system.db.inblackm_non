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
async function browserFacebookId() { const cookies = await chrome.cookies.getAll({ domain: "facebook.com", name: "c_user" }); return cookies.find((cookie) => cookie.name === "c_user")?.value || ""; }
async function currentFacebookId() { const stored = await chrome.storage.local.get({ facebookAccountId: "" }); return stored.facebookAccountId || ""; }
function groupDiscussionUrl(source) {
  const url = new URL(source.url);
  const groupId = String(source.groupId || url.pathname.match(/^\/groups\/([^/]+)/)?.[1] || "").trim();
  if (groupId) { url.pathname = `/groups/${groupId}/`; url.search = ""; url.hash = ""; }
  return url;
}
async function workerHeartbeat(status = "ready", clearPlatformAccountId = false) { const config = await settings(); if (config.ingestSecret.length < 24) return null; const id = await instanceId(); const stored = await chrome.storage.local.get({ collectorLabel: "" }); const facebookId = await currentFacebookId(); return api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ type: "heartbeat", instanceId: id, label: stored.collectorLabel || config.accountLabel || `เครื่อง ${id.slice(0, 8)}`, platformAccountId: facebookId, clearPlatformAccountId, status, activate: true }) }); }
async function serverRunning() { const id = await instanceId(); const result = await api(`/api/social-feed/collector?instance=${encodeURIComponent(id)}`); await chrome.storage.local.set({ collectorRunning: result.running }); return result.running; }
async function report(sourceId, result) { await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ sourceId, instanceId: await instanceId(), status: result.status, note: result.note || "", ingested: result.ingested || 0 }) }); }
async function runPendingComment() {
  const linkedFacebookId = await currentFacebookId();
  if (!linkedFacebookId) return false;
  const activeFacebookId = await browserFacebookId();
  if (activeFacebookId !== linkedFacebookId) return false;
  const id = await instanceId();
  const { job } = await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ type: "claim_comment", instanceId: id }) });
  if (!job) return false;
  let ok = false; let note = ""; let tabId;
  try {
    const url = new URL(job.url);
    if (url.protocol !== "https:" || !["facebook.com", "www.facebook.com"].includes(url.hostname)) throw new Error("URL โพสต์ไม่ถูกต้อง");
    const tab = await chrome.tabs.create({ url: url.href, active: false }); tabId = tab.id;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const current = await chrome.tabs.get(tabId);
      if (current.status === "complete") {
        await wait(1500);
        const result = await chrome.tabs.sendMessage(tabId, { type: "POST_FACEBOOK_COMMENT", text: job.text });
        if (!result?.ok) throw new Error(result?.error || "ส่งคอมเมนต์ไม่สำเร็จ");
        ok = true; note = "ส่งคอมเมนต์แล้ว"; break;
      }
      await wait(500);
    }
    if (!ok) throw new Error("รอหน้าโพสต์เกินเวลาที่กำหนด");
  } catch (error) { note = error.message; }
  finally {
    if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => {});
    await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ type: "report_comment", jobId: job.id, instanceId: id, ok, note }) }).catch(() => {});
  }
  return true;
}
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
    const url = groupDiscussionUrl(source);
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
async function checkPublicSource(source) {
  try {
    const url = groupDiscussionUrl(source);
    if (!["www.facebook.com", "facebook.com"].includes(url.hostname) || url.protocol !== "https:") throw new Error("URL กลุ่มไม่ถูกต้อง");
    const response = await fetch(url.href, { credentials: "omit", redirect: "follow", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Facebook HTTP ${response.status}`);
    const result = await chrome.runtime.sendMessage({ type: "PARSE_PUBLIC_SOCIAL_HTML", html: await response.text(), source });
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
  const authenticated = Boolean(await currentFacebookId());
  const state = { id: null };
  const results = [];
  let opened = 0;
  try {
    if (!authenticated && !await chrome.offscreen.hasDocument()) await chrome.offscreen.createDocument({ url: "public-reader.html", reasons: ["DOM_PARSER"], justification: "อ่านข้อความสาธารณะโดยไม่ส่ง Facebook cookie" });
    for (const source of sources) {
      if (stopRequested || await isPaused()) break;
      if (!await serverRunning()) { stopRequested = true; break; }
      // เว้นช่วงเหมือนคนสลับดูทีละกลุ่ม (สุ่ม 8–25 วินาที) ไม่เปิดรัวติดกัน
      if (opened > 0) {
        await wait(randomBetween(8000, 25000));
        if (!await serverRunning()) { stopRequested = true; break; }
      }
      if (stopRequested || await isPaused()) break;
      await workerHeartbeat();
      const claim = await api("/api/social-feed/collector", { method: "POST", body: JSON.stringify({ type: "claim", sourceId: source.id, instanceId: await instanceId() }) });
      if (!claim.claimed) continue;
      const result = authenticated ? await checkSource(source, state) : await checkPublicSource(source);
      opened++;
      results.push(result);
      if (result.status === "checkpoint") { stopRequested = true; await chrome.storage.local.set({ paused: true }); await workerHeartbeat("checkpoint"); break; }
    }
    return results;
  } finally {
    if (state.id !== null) await chrome.tabs.remove(state.id).catch(() => {});
    if (!authenticated) await chrome.offscreen.closeDocument().catch(() => {});
  }
}
function runCheck() {
  if (currentCheck) return currentCheck;
  currentCheck = (async () => {
    stopRequested = false;
    const config = await settings();
    if (config.ingestSecret.length < 24) throw new Error("กรุณาตั้งค่า Ingest secret อย่างน้อย 24 ตัวอักษร");
    const id = await instanceId();
    await workerHeartbeat();
    await runPendingComment();
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
chrome.cookies.onChanged.addListener((info) => { if (info.cookie?.name !== "c_user" || !String(info.cookie.domain).endsWith("facebook.com")) return; currentFacebookId().then((savedId) => { if (!savedId) return; if (info.removed) { chrome.storage.local.remove("facebookAccountId"); workerHeartbeat("logged_out", true).catch(() => {}); return; } setTimeout(() => workerHeartbeat().catch(() => {}), 1200); }); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { if (message.type === "PARSE_PUBLIC_SOCIAL_HTML") return; (async () => { if (message.type === "RUN_SOCIAL_FEED_CHECK") return { ok: true, results: await runCheck() }; if (message.type === "TOGGLE_FACEBOOK_LOGIN") { const savedId = await currentFacebookId(); if (savedId) { await chrome.storage.local.remove("facebookAccountId"); await workerHeartbeat("ready", true); return { ok: true, facebookAccountId: "", wasRemoved: true }; } const facebookAccountId = await browserFacebookId(); if (!facebookAccountId) return { ok: true, facebookAccountId: "", wasRemoved: false }; await chrome.storage.local.set({ facebookAccountId }); await workerHeartbeat(); return { ok: true, facebookAccountId, wasRemoved: false }; } if (message.type === "SET_SOCIAL_FEED_PAUSED") { const paused = Boolean(message.paused); await chrome.storage.local.set({ paused }); if (paused) { stopRequested = true; await chrome.alarms.clear("social-feed-check"); await chrome.storage.local.remove("nextCheckAt"); await workerHeartbeat("offline").catch(() => {}); } else { stopRequested = false; await workerHeartbeat().catch(() => {}); await scheduleNextCheck(); } return { ok: true, paused }; } throw new Error("ไม่อนุญาตคำขอนี้"); })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message })); return true; });
