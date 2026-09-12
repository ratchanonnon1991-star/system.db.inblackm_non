const CHANNEL = "gameinfo-russia-check-v1";

// Public messages contain status only. The extension submits Form Data directly
// from its isolated content script; this page never receives it.
export function requestRussiaCheckExtension(action, fields = {}, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { cleanup(); reject(Error("ไม่พบส่วนขยาย กรุณาติดตั้งแล้วรีโหลดหน้าเว็บ")); }, timeout);
    function cleanup() { clearTimeout(timer); window.removeEventListener("message", receive); }
    function receive(event) {
      const message = event.data;
      if (event.source !== window || event.origin !== window.location.origin || message?.channel !== CHANNEL || message.direction !== "response" || message.requestId !== requestId) return;
      cleanup();
      if (message.result?.error) reject(Error(message.result.error));
      else resolve(message.result);
    }
    window.addEventListener("message", receive);
    window.postMessage({ channel: CHANNEL, direction: "request", requestId, action, sourceId: fields.sourceId, provider: fields.provider }, window.location.origin);
  });
}
