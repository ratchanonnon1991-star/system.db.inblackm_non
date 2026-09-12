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
function postMessage(article) {
  const explicit = article.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
  if (explicit?.innerText?.trim()) return explicit.innerText.trim();
  return [...article.querySelectorAll('div[dir="auto"]')]
    .map((node) => node.innerText?.trim() || "")
    .filter((text) => text.length >= 3 && !/^(like|comment|share|ถูกใจ|แสดงความคิดเห็น|แชร์)$/i.test(text))
    .sort((a, b) => b.length - a.length)[0] || "";
}
function collectPosts(source, found) {
  for (const link of document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]')) {
    const url = new URL(link.href);
    const match = url.pathname.match(/\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)/);
    if (!match || !["www.facebook.com", "facebook.com"].includes(url.hostname)) continue;
    const expected = new URL(source.url).pathname.match(/\/groups\/([^/]+)/)?.[1];
    if (![expected, String(source.groupId)].includes(match[1])) continue;
    const article = link.closest('[role="article"]');
    const message = article ? postMessage(article) : "";
    if (!message || message.length < 3) continue;
    const timeNode = link.querySelector("time[datetime], [data-utime]") || article.querySelector("time[datetime], [data-utime]");
    const stamp = Number(timeNode?.getAttribute("data-utime"));
    const date = stamp > 0 ? new Date(stamp * 1000) : new Date(timeNode?.getAttribute("datetime") || "");
    found.set(match[2], { sourceId: source.id, groupId: source.groupId, externalPostId: `${source.groupId}_${match[2]}`, message: message.slice(0, 20000), originalUrl: url.origin + url.pathname, postedAt: Number.isNaN(date.getTime()) ? null : date.toISOString() });
  }
}
async function scan(source) {
  const found = new Map();
  let stale = 0;
  for (let step = 0; step < 10; step += 1) {
    if (location.pathname.includes("checkpoint")) return { status: "checkpoint", note: "Facebook ต้องการยืนยันตัวตน", posts: [] };
    dismissLoginPrompt();
    await pause(1000);
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
  return { status: login ? "logged_out" : "unknown", note: login ? "ปิด Popup ไม่ได้หรือ Facebook ต้องการ Login" : "หน้าโหลดแล้วแต่ยังอ่านโพสต์ไม่ได้ — ต้องตรวจโครงสร้างโพสต์ของหน้านี้", posts: [] };
}
let scanning;
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SCAN_FACEBOOK_GROUP") return;
  if (!scanning) scanning = scan(message.source).finally(() => { scanning = null; });
  scanning.then(sendResponse).catch((error) => sendResponse({ status: "error", note: error.message, posts: [] }));
  return true;
});
