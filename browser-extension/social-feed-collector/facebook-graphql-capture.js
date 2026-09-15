(function captureFacebookGraphqlDocuments() {
  function readHeader(headers, key) {
    if (!headers) return "";
    const lower = key.toLowerCase();
    try {
      if (typeof headers.get === "function") return headers.get(key) || headers.get(lower) || "";
      if (Array.isArray(headers)) { const hit = headers.find(([name]) => String(name).toLowerCase() === lower); return hit ? String(hit[1]) : ""; }
      for (const [name, value] of Object.entries(headers)) if (String(name).toLowerCase() === lower) return String(value);
    } catch { /* ignore header shape we cannot read */ }
    return "";
  }
  function extract(url, body, headers) {
    try {
      if (!String(url || "").includes("/api/graphql")) return null;
      const params = typeof body === "string" ? new URLSearchParams(body) : body instanceof URLSearchParams || body instanceof FormData ? body : null;
      const name = params?.get("fb_api_req_friendly_name") || "";
      const docId = params?.get("doc_id") || "";
      const asbdId = readHeader(headers, "x-asbd-id");
      const message = {};
      if (name && /^\d+$/.test(docId)) { message.name = name; message.docId = docId; }
      if (/^\d+$/.test(asbdId)) message.asbdId = asbdId;
      // เก็บ attribution/tracking จริงจาก mutation คอมเมนต์ของ Facebook เอง (ถ้าผู้ใช้เคยคอมเมนต์ผ่านหน้าเว็บ)
      if (name === "useCometUFICreateCommentMutation") {
        try {
          const input = JSON.parse(params.get("variables") || "{}")?.input || {};
          if (typeof input.attribution_id_v2 === "string" && input.attribution_id_v2) message.attribution = input.attribution_id_v2;
          if (Array.isArray(input.tracking) && input.tracking.length) message.tracking = input.tracking;
        } catch { /* ignore malformed variables */ }
      }
      return Object.keys(message).length ? message : null;
    } catch { return null; }
  }
  const report = (message) => { if (message) window.postMessage({ source: "inblackm-facebook-graphql", ...message }, "*"); };
  const originalFetch = window.fetch;
  if (typeof originalFetch === "function" && !originalFetch.__inblackmWrapped) {
    const wrappedFetch = function wrappedFacebookFetch(input, init) {
      const headers = init?.headers || (input && typeof input === "object" ? input.headers : null);
      report(extract(typeof input === "string" ? input : input?.url, init?.body, headers));
      return originalFetch.apply(this, arguments);
    };
    wrappedFetch.__inblackmWrapped = true;
    window.fetch = wrappedFetch;
  }
  const xhr = window.XMLHttpRequest?.prototype;
  if (xhr && !xhr.__inblackmWrapped) {
    const originalOpen = xhr.open;
    const originalSetHeader = xhr.setRequestHeader;
    const originalSend = xhr.send;
    xhr.open = function openFacebookRequest(_method, url) { this.__inblackmUrl = url; this.__inblackmHeaders = {}; return originalOpen.apply(this, arguments); };
    xhr.setRequestHeader = function setFacebookHeader(name, value) { try { (this.__inblackmHeaders = this.__inblackmHeaders || {})[name] = value; } catch { /* ignore */ } return originalSetHeader.apply(this, arguments); };
    xhr.send = function sendFacebookRequest(body) { report(extract(this.__inblackmUrl, body, this.__inblackmHeaders)); return originalSend.apply(this, arguments); };
    xhr.__inblackmWrapped = true;
  }
})();
