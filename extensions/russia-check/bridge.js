/* global chrome */
(() => {
  const CHANNEL = "gameinfo-russia-check-v1";
  const origin = globalThis.RUSSIA_CHECK_CONFIG.origin;
  if (window.top !== window || location.origin !== origin) return;
  const allowed = new Set(["ping", "status", "begin", "cancel"]);
  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (event.source !== window || event.origin !== origin || data?.channel !== CHANNEL || data.direction !== "request" ||
        !allowed.has(data.action) || typeof data.requestId !== "string" || data.requestId.length > 80 ||
        !/^\/gameinfo\/[a-z-]+\/russia-check(?:\/extension)?\/?$/.test(location.pathname)) return;
    let result;
    try { result = await chrome.runtime.sendMessage({ action: data.action, sourceId: data.sourceId, provider: data.provider }); }
    catch { result = { error: "ส่วนขยายไม่พร้อม กรุณารีโหลดหน้าเว็บหรือติดตั้งใหม่" }; }
    window.postMessage({ channel: CHANNEL, direction: "response", requestId: data.requestId, result }, origin);
  });
  // Never relay captured Form Data into window.postMessage, DOM, localStorage,
  // or logs. Submit from the isolated world, with the normal GameInfo session.
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "russia-check-capture" ||
        location.origin !== origin || !/^\/gameinfo\/[a-z-]+\/russia-check\/?$/.test(location.pathname) ||
        !Number.isSafeInteger(message.sourceId) || message.sourceId <= 0 || typeof message.formData !== "string" || message.formData.length > 65536) return;
    reply({ accepted: true });
    void (async () => {
      let result;
      try {
        const response = await fetch(`/api/gameinfo/russia-check/sources/${message.sourceId}/session`, {
          method: "PUT", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(55000),
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formData: message.formData }),
        });
        message.formData = "";
        const body = await response.json();
        result = response.ok && body.authState === "verified"
          ? { ok: true, packCount: body.verifiedPackCount }
          : { ok: false, retryLogin: body.retryLogin === true, error: body.error || "ตรวจสอบ Login ไม่สำเร็จ" };
      } catch { result = { ok: false, error: "ติดต่อเว็บเราไม่สำเร็จ กรุณาตรวจสถานะ Login แล้วลองใหม่" }; }
      finally { message.formData = ""; }
      await chrome.runtime.sendMessage({ action: "complete", flowId: message.flowId, ...result }).catch(() => {});
    })();
    return false;
  });
})();
