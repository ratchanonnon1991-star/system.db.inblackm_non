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
    let article = link.closest('[role="article"]');
    while (article && ![...article.querySelectorAll('[aria-label]')].some((node) => /^(การดำเนินการสำหรับโพสต์นี้โดย|(?:actions|options) for this post by)/iu.test((node.getAttribute("aria-label") || "").trim()))) article = article.parentElement?.closest('[role="article"]') || null;
    if (!article) continue;
    const text = article?.textContent?.trim();
    if (!groupId || !postId || !text || text.length < 3) continue;
    const timeNode = article.querySelector("time[datetime], [data-utime]");
    const unixTime = Number(timeNode?.getAttribute("data-utime"));
    const parsedTime = unixTime > 0 ? new Date(unixTime * 1000) : new Date(timeNode?.getAttribute("datetime") || "");
    const actionLabel = [...article.querySelectorAll('[aria-label]')].map((node) => (node.getAttribute("aria-label") || "").trim()).find((label) => /^(การดำเนินการสำหรับโพสต์นี้โดย|(?:actions|options) for this post by)/iu.test(label)) || "";
    const actionAuthor = actionLabel.replace(/^การดำเนินการสำหรับโพสต์นี้โดย\s+/u, "").replace(/^(?:actions|options) for this post by\s+/i, "");
    const anonymous = [...article.querySelectorAll('[role="button"]')].map((node) => (node.textContent || "").replace(/\s+/g, " ").trim()).find((text) => /^(ผู้มีส่วนร่วมที่ไม่ระบุตัวตน|anonymous participant)$/iu.test(text));
    const authorNode = [...article.querySelectorAll('h2 span, h3 span, strong > span, a[href*="/user/"] span.html-span, a[href*="profile.php"] span.html-span')].find((node) => !/^\d+\s*(วินาที|นาที|ชม\.|ชั่วโมง|วัน|min|mins|hour|hours|day|days)$/iu.test((node.textContent || "").trim()));
    const authorName = anonymous || (actionAuthor || authorNode?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200).replace(/\S+/gu, (word) => { const characters = Array.from(word); return characters[0] + "*".repeat(Math.max(0, characters.length - 1)); });
    posts.set(postId, { sourceId: message.source.id, groupId: message.source.groupId, externalPostId: `${message.source.groupId}_${postId}`, authorName, message: text.slice(0, 20000), originalUrl: `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`, postedAt: Number.isNaN(parsedTime.getTime()) ? null : parsedTime.toISOString() });
  }
  const blocked = doc.querySelector('input[name="email"], form[action*="login"]');
  sendResponse({ status: posts.size ? "ready" : blocked ? "logged_out" : "unknown", note: posts.size ? `อ่านได้ ${posts.size} โพสต์` : blocked ? "ข้าม: Facebook ต้องการ Login" : `อ่านโพสต์จาก HTML Public ไม่ได้ (พบลิงก์โพสต์ ${postLinks}) — ไม่ได้ถูกตัดด้วย Rule`, postLinks, posts: [...posts.values()].slice(0, 500) });
});
