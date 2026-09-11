function pageStatus() {
  const path = location.pathname;
  if (path.startsWith("/login") || document.querySelector('input[name="email"]')) return { status: "logged_out", note: "Facebook session หมดอายุ" };
  if (path.includes("checkpoint") || document.body.innerText.includes("Security Check")) return { status: "checkpoint", note: "Facebook ต้องยืนยันตัวตน" };
  const buttons = [...document.querySelectorAll('[role="button"]')].map((node) => node.textContent.trim());
  if (buttons.some((text) => /^(Join group|เข้าร่วมกลุ่ม|เข้าร่วม)$/i.test(text))) return { status: "needs_join", note: "บัญชีนี้ยังไม่ได้เข้ากลุ่ม" };
  if (!document.querySelector('[role="feed"], [role="main"]')) return { status: "unknown", note: "ยังยืนยันหน้ากลุ่มไม่ได้" };
  return { status: "ready", note: "Session ใช้งานได้และมองเห็นกลุ่ม" };
}

function collectPosts(source) {
  const found = new Map();
  for (const link of document.querySelectorAll('a[href*="/posts/"]')) {
    const match = link.href.match(/\/posts\/(\d+)/);
    const article = link.closest('[role="article"]');
    const message = article?.innerText?.trim();
    if (!match || !message || message.length < 3) continue;
    found.set(match[1], {
      sourceId: source.id,
      groupId: source.groupId,
      externalPostId: `${source.groupId}_${match[1]}`,
      message: message.slice(0, 20000),
      originalUrl: link.href.split("?")[0],
      postedAt: new Date().toISOString()
    });
  }
  return [...found.values()].slice(0, 30);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SCAN_FACEBOOK_GROUP") return;
  const result = pageStatus();
  sendResponse({ ...result, posts: result.status === "ready" ? collectPosts(message.source) : [] });
});
