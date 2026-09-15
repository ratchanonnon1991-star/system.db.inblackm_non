(function captureFacebookGraphqlDocuments() {
  function extract(url, body) {
    try {
      if (!String(url || "").includes("/api/graphql")) return null;
      const params = typeof body === "string" ? new URLSearchParams(body) : body instanceof URLSearchParams || body instanceof FormData ? body : null;
      const name = params?.get("fb_api_req_friendly_name");
      const docId = params?.get("doc_id");
      return name && /^\d+$/.test(docId || "") ? { name, docId } : null;
    } catch { return null; }
  }
  const report = (request) => { if (request) window.postMessage({ source: "inblackm-facebook-graphql", ...request }, "*"); };
  const originalFetch = window.fetch;
  if (typeof originalFetch === "function" && !originalFetch.__inblackmWrapped) {
    const wrappedFetch = function wrappedFacebookFetch(input, init) {
      report(extract(typeof input === "string" ? input : input?.url, init?.body));
      return originalFetch.apply(this, arguments);
    };
    wrappedFetch.__inblackmWrapped = true;
    window.fetch = wrappedFetch;
  }
  const xhr = window.XMLHttpRequest?.prototype;
  if (xhr && !xhr.__inblackmWrapped) {
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    xhr.open = function openFacebookRequest(_method, url) { this.__inblackmUrl = url; return originalOpen.apply(this, arguments); };
    xhr.send = function sendFacebookRequest(body) { report(extract(this.__inblackmUrl, body)); return originalSend.apply(this, arguments); };
    xhr.__inblackmWrapped = true;
  }
})();
