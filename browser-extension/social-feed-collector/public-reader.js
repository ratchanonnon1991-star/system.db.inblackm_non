chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "PARSE_PUBLIC_SOCIAL_HTML") return;
  const doc = new DOMParser().parseFromString(message.html, "text/html");
  const posts = new Map();
  for (const link of doc.querySelectorAll('a[href*="/posts/"]')) {
    const url = new URL(link.getAttribute("href"), message.source.url);
    const match = url.pathname.match(/\/groups\/([^/]+)\/posts\/(\d+)/);
    const article = link.closest('[role="article"]');
    const text = article?.textContent?.trim();
    if (!match || !text || text.length < 3) continue;
    posts.set(match[2], { sourceId: message.source.id, groupId: message.source.groupId, externalPostId: `${message.source.groupId}_${match[2]}`, message: text.slice(0, 20000), originalUrl: url.origin + url.pathname, postedAt: new Date().toISOString() });
  }
  const blocked = doc.querySelector('input[name="email"], form[action*="login"]');
  sendResponse({ status: posts.size ? "ready" : blocked ? "logged_out" : "unknown", note: posts.size ? `อ่านแบบไม่ Login ได้ ${posts.size} โพสต์` : blocked ? "ข้าม: Facebook ต้องการ Login" : "ไม่พบข้อความโพสต์ใน HTML สาธารณะ (หน้าอาจต้องใช้ JavaScript หรือ Login)", posts: [...posts.values()].slice(0, 30) });
});
