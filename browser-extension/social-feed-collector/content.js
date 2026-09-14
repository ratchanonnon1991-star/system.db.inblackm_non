const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function dismissLoginPrompt() {
  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    if (!dialog.querySelector('input[name="email"], input[type="password"]')) continue;
    const close = [...dialog.querySelectorAll('button, [role="button"]')].find((node) => /^(close|ปิด)$/i.test(node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent.trim()));
    if (close) close.click();
  }
}
function expandVisiblePosts() {
  for (const article of document.querySelectorAll('[role="article"]')) {
    for (const node of article.querySelectorAll('button, [role="button"]')) {
      if (/^(see more|ดูเพิ่มเติม)$/i.test(node.textContent.trim())) node.click();
    }
  }
}
function openDiscussionTab() {
  const label = /^(discussion|สนทนา|โพสต์|พูดคุย|feed)$/i;
  for (const node of document.querySelectorAll('[role="tab"], [role="tablist"] a, a[href*="/groups/"]')) {
    const text = (node.getAttribute("aria-label") || node.textContent || "").trim();
    if (!label.test(text)) continue;
    if (node.getAttribute("aria-selected") === "true") return false;
    node.click();
    return true;
  }
  return false;
}
function postMessage(article) {
  const explicit = article.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
  if (explicit?.innerText?.trim()) return explicit.innerText.trim();
  return [...article.querySelectorAll('div[dir="auto"]')]
    .map((node) => node.innerText?.trim() || "")
    .filter((text) => text.length >= 3 && !/^(like|comment|share|ถูกใจ|แสดงความคิดเห็น|แชร์)$/i.test(text))
    .sort((a, b) => b.length - a.length)[0] || "";
}
const THAI_MONTHS = new Map([
  ["มกราคม", 0], ["กุมภาพันธ์", 1], ["มีนาคม", 2], ["เมษายน", 3], ["พฤษภาคม", 4], ["มิถุนายน", 5],
  ["กรกฎาคม", 6], ["สิงหาคม", 7], ["กันยายน", 8], ["ตุลาคม", 9], ["พฤศจิกายน", 10], ["ธันวาคม", 11],
  ["ม.ค.", 0], ["ก.พ.", 1], ["มี.ค.", 2], ["เม.ย.", 3], ["พ.ค.", 4], ["มิ.ย.", 5],
  ["ก.ค.", 6], ["ส.ค.", 7], ["ก.ย.", 8], ["ต.ค.", 9], ["พ.ย.", 10], ["ธ.ค.", 11],
]);
const ENGLISH_MONTHS = new Map([
  ["jan", 0], ["january", 0], ["feb", 1], ["february", 1], ["mar", 2], ["march", 2],
  ["apr", 3], ["april", 3], ["may", 4], ["jun", 5], ["june", 5], ["jul", 6], ["july", 6],
  ["aug", 7], ["august", 7], ["sep", 8], ["sept", 8], ["september", 8], ["oct", 9], ["october", 9],
  ["nov", 10], ["november", 10], ["dec", 11], ["december", 11],
]);
const ENGLISH_UNIT_MS = new Map([
  ["s", 1000], ["sec", 1000], ["secs", 1000], ["second", 1000], ["seconds", 1000],
  ["m", 60000], ["min", 60000], ["mins", 60000], ["minute", 60000], ["minutes", 60000],
  ["h", 3600000], ["hr", 3600000], ["hrs", 3600000], ["hour", 3600000], ["hours", 3600000],
  ["d", 86400000], ["day", 86400000], ["days", 86400000],
  ["w", 604800000], ["wk", 604800000], ["wks", 604800000], ["week", 604800000], ["weeks", 604800000],
]);
function parseEnglishDateLabel(text, now) {
  const lower = text.toLowerCase();
  if (/^(just now|a few seconds ago|a moment ago)$/.test(lower)) return new Date(now);
  if (/^yesterday\b/.test(lower)) return new Date(now.getTime() - 86400000);
  const relative = lower.match(/^(?:about\s+)?(\d+)\s*([a-z]+)(?:\s+ago)?$/);
  if (relative) {
    const unitMs = ENGLISH_UNIT_MS.get(relative[2]);
    if (unitMs) return new Date(now.getTime() - Number(relative[1]) * unitMs);
  }
  const single = lower.match(/^an?\s+([a-z]+)\s+ago$/);
  if (single) {
    const unitMs = ENGLISH_UNIT_MS.get(single[1]);
    if (unitMs) return new Date(now.getTime() - unitMs);
  }
  let month;
  let day;
  let year;
  let hasYear = false;
  let dm = lower.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (dm && ENGLISH_MONTHS.has(dm[1])) {
    month = ENGLISH_MONTHS.get(dm[1]);
    day = Number(dm[2]);
    hasYear = Boolean(dm[3]);
    year = hasYear ? Number(dm[3]) : now.getFullYear();
  } else {
    dm = lower.match(/^(\d{1,2})\s+([a-z]+)(?:,?\s+(\d{4}))?/);
    if (dm && ENGLISH_MONTHS.has(dm[2])) {
      month = ENGLISH_MONTHS.get(dm[2]);
      day = Number(dm[1]);
      hasYear = Boolean(dm[3]);
      year = hasYear ? Number(dm[3]) : now.getFullYear();
    }
  }
  if (month === undefined) return null;
  let date = new Date(year, month, day, 12, 0, 0, 0);
  if (!hasYear && date.getTime() > now.getTime() + 86400000) date = new Date(year - 1, month, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}
function parseFacebookDateLabel(value, now = new Date()) {
  const text = String(value || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit))).replace(/\s+/g, " ").trim();
  if (/^เมื่อสักครู่$/.test(text)) return new Date(now);
  const relative = text.match(/^(\d+)\s*(วินาที|นาที|ชม\.|ชั่วโมง|วัน)$/);
  if (relative) {
    const unitMs = { "วินาที": 1000, "นาที": 60000, "ชม.": 3600000, "ชั่วโมง": 3600000, "วัน": 86400000 }[relative[2]];
    return new Date(now.getTime() - Number(relative[1]) * unitMs);
  }
  if (/^เมื่อวาน(?:นี้)?$/.test(text)) return new Date(now.getTime() - 86400000);
  const match = text.match(/^(\d{1,2})\s+([ก-๙.]+)(?:\s+(\d{4}))?/);
  if (match && THAI_MONTHS.has(match[2])) {
    let year = match[3] ? Number(match[3]) : now.getFullYear();
    if (year > 2400) year -= 543;
    let date = new Date(year, THAI_MONTHS.get(match[2]), Number(match[1]), 12, 0, 0, 0);
    if (!match[3] && date.getTime() > now.getTime() + 86400000) date = new Date(year - 1, THAI_MONTHS.get(match[2]), Number(match[1]), 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return parseEnglishDateLabel(text, now);
}
function postReference(url) {
  const pathMatch = url.pathname.match(/\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)/);
  if (pathMatch) return { groupId: pathMatch[1], postId: pathMatch[2] };
  const groupId = url.pathname.match(/\/groups\/([^/]+)/)?.[1];
  const postId = url.searchParams.get("multi_permalinks")?.match(/^\d+$/)?.[0];
  return groupId && postId ? { groupId, postId } : null;
}
function postDate(link, article) {
  const selector = 'time[datetime], [data-utime], a[aria-label][href*="multi_permalinks="], a[aria-label][href*="/posts/"], a[aria-label][href*="/permalink/"]';
  const candidates = [link, ...(article ? article.querySelectorAll(selector) : [])];
  for (const candidate of candidates) {
    const timeNode = candidate.matches("time[datetime], [data-utime]") ? candidate : candidate.querySelector("time[datetime], [data-utime]");
    const stamp = Number(timeNode?.getAttribute("data-utime"));
    if (stamp > 0) return new Date(stamp * 1000);
    const datetime = timeNode?.getAttribute("datetime");
    if (datetime) {
      const date = new Date(datetime);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  for (const candidate of candidates) {
    for (const label of [candidate.getAttribute("aria-label"), candidate.getAttribute("title"), candidate.textContent]) {
      const parsed = parseFacebookDateLabel(label);
      if (parsed) return parsed;
    }
  }
  return null;
}
function collectPosts(source, found) {
  for (const link of document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="multi_permalinks="]')) {
    const url = new URL(link.href);
    const reference = postReference(url);
    if (!reference || !["www.facebook.com", "facebook.com"].includes(url.hostname)) continue;
    const expected = new URL(source.url).pathname.match(/\/groups\/([^/]+)/)?.[1];
    if (![expected, String(source.groupId)].includes(reference.groupId)) continue;
    const article = link.closest('[role="article"]');
    const message = article ? postMessage(article) : "";
    if (!message || message.length < 3) continue;
    const date = postDate(link, article);
    found.set(reference.postId, { sourceId: source.id, groupId: source.groupId, externalPostId: `${source.groupId}_${reference.postId}`, message: message.slice(0, 20000), originalUrl: `https://www.facebook.com/groups/${reference.groupId}/permalink/${reference.postId}/`, postedAt: !date || Number.isNaN(date.getTime()) ? found.get(reference.postId)?.postedAt || null : date.toISOString() });
  }
}
async function scan(source) {
  const found = new Map();
  let stale = 0;
  let openedDiscussion = false;
  for (let step = 0; step < 10; step += 1) {
    if (location.pathname.includes("checkpoint")) return { status: "checkpoint", note: "Facebook ต้องการยืนยันตัวตน", posts: [] };
    dismissLoginPrompt();
    await pause(1000);
    const alreadyOnDiscussion = /^\/groups\/[^/]+\/?$/.test(location.pathname);
    if (!alreadyOnDiscussion && !openedDiscussion && openDiscussionTab()) { openedDiscussion = true; await pause(2500); continue; }
    expandVisiblePosts();
    await pause(500);
    const previous = found.size;
    collectPosts(source, found);
    stale = found.size === previous ? stale + 1 : 0;
    if (found.size >= 100 || (step >= 3 && stale >= 3)) break;
    window.scrollBy(0, Math.max(window.innerHeight, 800));
  }
  if (found.size) return { status: "ready", note: `อ่านหน้าเว็บได้ ${found.size} โพสต์`, posts: [...found.values()].slice(0, 100) };
  const login = location.pathname.startsWith("/login") || [...document.querySelectorAll('[role="dialog"]')].some((node) => node.querySelector('input[type="password"]'));
  const tabs = [...document.querySelectorAll('[role="tab"], [role="tablist"] a')].map((n) => `${(n.getAttribute("aria-label") || n.textContent || "").trim().slice(0, 24)}${n.getAttribute("aria-selected") === "true" ? "*" : ""}`).filter(Boolean).slice(0, 12);
  const debug = ` · path=${location.pathname} · tabs=[${tabs.join("|")}]`;
  return { status: login ? "logged_out" : "unknown", note: (login ? "ปิด Popup ไม่ได้หรือ Facebook ต้องการ Login" : "หน้าโหลดแล้วแต่ยังอ่านโพสต์ไม่ได้ — ต้องตรวจโครงสร้างโพสต์ของหน้านี้") + debug, posts: [] };
}
let scanning;
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SCAN_FACEBOOK_GROUP") return;
  if (!scanning) scanning = scan(message.source).finally(() => { scanning = null; });
  scanning.then(sendResponse).catch((error) => sendResponse({ status: "error", note: error.message, posts: [] }));
  return true;
});
