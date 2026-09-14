chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "PARSE_PUBLIC_SOCIAL_HTML") return;
  const doc = new DOMParser().parseFromString(message.html, "text/html");
  const posts = new Map();
  let postLinks = 0;
  for (const link of doc.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="multi_permalinks="]')) {
    const url = new URL(link.getAttribute("href"), message.source.url);
    postLinks += 1;
    const pathMatch = url.pathname.match(/\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)/);
    const groupId = pathMatch?.[1] || url.pathname.match(/\/groups\/([^/]+)/)?.[1];
    const postId = pathMatch?.[2] || url.searchParams.get("multi_permalinks")?.match(/^\d+$/)?.[0];
    const article = link.closest('[role="article"]');
    const text = article?.textContent?.trim();
    if (!groupId || !postId || !text || text.length < 3) continue;
    const timeNode = article.querySelector("time[datetime], [data-utime]");
    const unixTime = Number(timeNode?.getAttribute("data-utime"));
    const parsedTime = unixTime > 0 ? new Date(unixTime * 1000) : new Date(timeNode?.getAttribute("datetime") || "");
    posts.set(postId, { sourceId: message.source.id, groupId: message.source.groupId, externalPostId: `${message.source.groupId}_${postId}`, message: text.slice(0, 20000), originalUrl: `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`, postedAt: Number.isNaN(parsedTime.getTime()) ? null : parsedTime.toISOString() });
  }
  const blocked = doc.querySelector('input[name="email"], form[action*="login"]');
  sendResponse({ status: posts.size ? "ready" : blocked ? "logged_out" : "unknown", note: posts.size ? `อ่านได้ ${posts.size} โพสต์` : blocked ? "ข้าม: Facebook ต้องการ Login" : `อ่านโพสต์จาก HTML Public ไม่ได้ (พบลิงก์โพสต์ ${postLinks}) — ไม่ได้ถูกตัดด้วย Rule`, postLinks, posts: [...posts.values()].slice(0, 500) });
});
