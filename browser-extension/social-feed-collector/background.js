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
async function sendFacebookCommentInPage({ url, text, capturedDocId, envelope = {} }) {
  const unescapeHtml = (value) => String(value || "").replace(/&quot;|&#0?34;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2f;|&#47;/gi, "/").replace(/&amp;/g, "&");
  const first = (value, patterns) => { for (const pattern of patterns) { const match = value.match(pattern); if (match?.[1]) return unescapeHtml(match[1]).replace(/\\\//g, "/"); } return ""; };
  const cookie = (name) => document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] || "";
  const target = new URL(url);
  target.protocol = location.protocol;
  target.host = location.host;
  const pageResponse = await fetch(target.href, { credentials: "include", redirect: "follow" });
  if (!pageResponse.ok) throw new Error(`โหลดโพสต์ไม่ได้ (Facebook HTTP ${pageResponse.status})`);
  const html = await pageResponse.text();
  const decoded = unescapeHtml(html).replace(/\\\//g, "/");
  const actor = first(decoded, [/"actorID"\s*:\s*"(\d+)"/, /"USER_ID"\s*:\s*"(\d+)"/, /__user=(\d+)/]) || cookie("c_user");
  const fbDtsg = first(decoded, [/"DTSGInitData",\[\],\{"token":"([^"\\]+)/, /"name"\s*:\s*"fb_dtsg"[\s\S]{0,300}?"value"\s*:\s*"([^"\\]+)/, /name="fb_dtsg"\s+value="([^"]+)/]);
  const lsd = first(decoded, [/"LSD",\[\],\{"token":"([^"\\]+)/, /"name"\s*:\s*"lsd"[\s\S]{0,300}?"value"\s*:\s*"([^"\\]+)/]);
  if (!actor || !fbDtsg) throw new Error("อ่าน Session Token จาก Facebook ไม่ได้");
  const postId = first(target.href, [/[?&]fbid=(\d+)/, /[?&]story_fbid=(\d+)/, /\/permalink\/(\d+)/, /\/posts\/(\d+)/]);
  let feedbackId = postId ? btoa(`feedback:${postId}`) : first(decoded, [/"feedback_id"\s*:\s*"(ZmVlZGJhY2s6[0-9A-Za-z_+/=-]+)"/, /(ZmVlZGJhY2s6[0-9A-Za-z_+/=-]+)/]);
  if (!feedbackId) throw new Error("หา feedback_id ของโพสต์ไม่พบ");
  const groupId = first(target.href, [/\/groups\/(\d+)/]) || first(decoded, [/"groupID"\s*:\s*"(\d+)"/, /"group_id"\s*:\s*"(\d+)"/]);
  const now = Date.now();
  const variables = {
    input: {
      client_mutation_id: "40",
      attachments: null,
      feedback_id: feedbackId,
      formatting_style: null,
      message: { ranges: [], text: String(text || "") },
      attribution_id_v2: envelope.attribution || `CometSinglePostDialogRoot.react,comet.post.single_dialog.group,via_cold_start,${now},309365,${now % 4000000000},,`,
      vod_video_timestamp: null,
      feedback_referrer: target.pathname,
      is_tracking_encrypted: true,
      tracking: Array.isArray(envelope.tracking) && envelope.tracking.length ? envelope.tracking : [JSON.stringify({ assistant_caller: "comet_above_composer", conversation_guide_session_id: null, conversation_guide_shown: null })],
      feedback_source: "OBJECT",
      idempotence_token: `client:${crypto.randomUUID()}`,
      session_id: crypto.randomUUID(),
    },
    feedLocation: "POST_PERMALINK_DIALOG",
    feedbackSource: 2,
    groupID: groupId || null,
    inviteShortLinkKey: null,
    renderLocation: null,
    scale: 1,
    useDefaultActor: false,
    focusCommentID: null,
    translationType: "AUTO_TRANSLATE",
    canUseNicknameOnComet: false,
    __relay_internal__pv__groups_comet_use_glvrelayprovider: false,
    __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: true,
    __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: "AUTO_TRANSLATE",
  };
  const friendlyName = "useCometUFICreateCommentMutation";
  const nearbyDocId = first(decoded, [new RegExp(`${friendlyName}[\\s\\S]{0,1200}?[\\\\\"]doc_id[\\\\\"]\\s*:\\s*[\\\\\"](\\d{10,})`), new RegExp(`[\\\\\"]doc_id[\\\\\"]\\s*:\\s*[\\\\\"](\\d{10,})[\\s\\S]{0,1200}?${friendlyName}`)]);
  const form = new URLSearchParams({
    av: actor, __aaid: "0", __user: actor, __a: "1", __req: "1", dpr: cookie("dpr") || "1",
    fb_dtsg: fbDtsg, jazoest: `2${[...fbDtsg].map((character) => character.charCodeAt(0)).join("")}`,
    fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: friendlyName, server_timestamps: "true",
    variables: JSON.stringify(variables), doc_id: capturedDocId || nearbyDocId || "27687311557628355",
  });
  const tokenPatterns = {
    __hs: [/"haste_session"\s*:\s*"([^"]+)/, /__hs=([^&"\\]+)/], __ccg: [/"connectionClass"\s*:\s*"([^"]+)/],
    __rev: [/"__spin_r"\s*:\s*(\d+)/], __s: [/"__s"\s*:\s*"([^"]+)/, /__s=([^&"\\]+)/], __hsi: [/"hsi"\s*:\s*"(\d+)/, /__hsi=(\d+)/],
    __dyn: [/"__dyn"\s*:\s*"([^"]*)/, /__dyn=([^&"\\]+)/], __csr: [/"__csr"\s*:\s*"([^"]*)/, /__csr=([^&"\\]+)/],
    __comet_req: [/__comet_req[=:\"]+(\d+)/], __spin_r: [/"__spin_r"\s*:\s*(\d+)/], __spin_b: [/"__spin_b"\s*:\s*"([^"]+)/], __spin_t: [/"__spin_t"\s*:\s*(\d+)/],
  };
  for (const [name, patterns] of Object.entries(tokenPatterns)) { const value = first(decoded, patterns); if (value) form.set(name, value); }
  if (lsd) form.set("lsd", lsd);
  const response = await fetch(`${location.origin}/api/graphql/`, {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-fb-friendly-name": friendlyName, "x-asbd-id": envelope.asbdId || "359341", ...(lsd ? { "x-fb-lsd": lsd } : {}) },
    body: form.toString(),
  });
  const raw = await response.text();
  const cleaned = raw.replace(/^for \(;;\);\s*/, "");
  let payload;
  try { payload = JSON.parse(cleaned); }
  catch { payload = cleaned.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); }
  const findComment = (value) => {
    if (!value || typeof value !== "object") return null;
    const node = value.data?.comment_create?.feedback_comment_edge?.node;
    if (node?.id) return node;
    for (const child of Object.values(value)) { const found = findComment(child); if (found) return found; }
    return null;
  };
  const comment = findComment(payload);
  if (!response.ok || !comment) throw new Error(payload.errors?.[0]?.message || `Facebook ไม่ยืนยันผลคอมเมนต์ (HTTP ${response.status})`);
  return { ok: true, commentId: comment.legacy_fbid || comment.id };
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
  let ok = false; let note = "";
  try {
    const url = new URL(job.url);
    if (url.protocol !== "https:" || !["facebook.com", "www.facebook.com"].includes(url.hostname)) throw new Error("URL โพสต์ไม่ถูกต้อง");
    let [tab] = await chrome.tabs.query({ url: ["https://www.facebook.com/*"] });
    if (!tab) { tab = await chrome.tabs.create({ url: "https://www.facebook.com/", active: false }); while ((await chrome.tabs.get(tab.id)).status !== "complete") await wait(500); }
    const { facebookGraphqlDocIds = {}, facebookGraphqlEnvelope = {} } = await chrome.storage.local.get({ facebookGraphqlDocIds: {}, facebookGraphqlEnvelope: {} });
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: sendFacebookCommentInPage, args: [{ url: url.href, text: job.text, capturedDocId: facebookGraphqlDocIds.useCometUFICreateCommentMutation || "", envelope: facebookGraphqlEnvelope }] });
    if (!injection?.result?.ok) throw new Error("ส่งคอมเมนต์ไม่สำเร็จ");
    ok = true; note = `ส่งคอมเมนต์แล้ว (${injection.result.commentId})`;
  } catch (error) { note = error.message; }
  finally {
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
