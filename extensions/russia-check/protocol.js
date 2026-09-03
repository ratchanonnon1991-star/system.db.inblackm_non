export const VERSION = "1.1.0";
export const CHANNEL = "gameinfo-russia-check-v1";
export const STORE_URL = "https://loveanddeepspace.infoldgames.com/charge/en-EN";
export const PRODUCTS_URL = "https://passport.infoldgames.com/v2/payment/user/products";
export const PROVIDERS = Object.freeze({
  infold: { name: "Love and Deepspace", storeUrl: STORE_URL, productsUrl: PRODUCTS_URL },
  gryphline: { name: "ARKNIGHTS: ENDFIELD", storeUrl: "https://topup.gryphline.com/endfield", productsUrl: "https://as.gryphline.com/user/pay/v3/query_web_product" },
});
export const ACTIVE = new Set(["confirming", "waiting", "submitting"]);

export function isAppUrl(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && /^\/gameinfo\/[a-z-]+\/russia-check(?:\/extension)?\/?$/.test(url.pathname);
  } catch { return false; }
}

// No cookies, login requests, headers, passwords, or response bodies are read.
export function capturedForm(details, state, now) {
  if (state?.provider === "gryphline") {
    if (state.status !== "waiting" || state.expiresAt <= now || details.tabId !== state.popupTabId || details.method !== "GET" || details.initiator !== "https://topup.gryphline.com") return null;
    try {
      const url = new URL(details.url);
      if (url.origin + url.pathname !== PROVIDERS.gryphline.productsUrl || url.hash || url.username || url.password || url.href.length > 65536) return null;
      const keys = ["token", "appCode", "serverId"];
      if ([...url.searchParams].length !== keys.length || keys.some((key) => url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key))) return null;
      if (url.searchParams.get("appCode") !== "d9f6dbb6bbd6bb33") return null;
      return url.href;
    } catch { return null; }
  }
  if (state?.provider && state.provider !== "infold") return null;
  if (!state || state.status !== "waiting" || state.expiresAt <= now || details.tabId !== state.popupTabId ||
      details.method !== "POST" || details.url !== PRODUCTS_URL ||
      ![new URL(STORE_URL).origin, new URL(PRODUCTS_URL).origin].includes(details.initiator)) return null;
  const keys = ["app_id", "timestamp", "sign_type", "clientid", "lang", "data", "sign"];
  let entries;
  if (details.requestBody?.formData) {
    entries = Object.entries(details.requestBody.formData);
    if (entries.some(([, values]) => !Array.isArray(values) || values.length !== 1)) return null;
    entries = entries.map(([key, values]) => [key, values[0]]);
  } else if (details.requestBody?.raw) {
    const chunks = details.requestBody.raw;
    if (chunks.some((chunk) => !chunk.bytes) || chunks.reduce((size, chunk) => size + chunk.bytes.byteLength, 0) > 65536) return null;
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.bytes.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) { bytes.set(new Uint8Array(chunk.bytes), offset); offset += chunk.bytes.byteLength; }
    entries = [...new URLSearchParams(new TextDecoder().decode(bytes))];
  } else return null;
  if (entries.length !== keys.length || new Set(entries.map(([key]) => key)).size !== keys.length ||
      entries.some(([key, value]) => !keys.includes(key) || typeof value !== "string" || !value || value.length > 65536)) return null;
  const form = Object.fromEntries(entries);
  if (form.app_id !== "1010001" || form.clientid !== "1067" || form.lang !== "en" || form.sign_type !== "hmac") return null;
  const encoded = new URLSearchParams(entries).toString();
  return encoded.length <= 65536 ? encoded : null;
}

export function publicState(state) {
  if (!state) return { status: "idle" };
  return { status: state.status, sourceId: state.sourceId, provider: state.provider || "infold", gameName: PROVIDERS[state.provider || "infold"]?.name, message: state.message || "", packCount: state.packCount || 0 };
}
