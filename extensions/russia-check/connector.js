import { ACTIVE, VERSION, PROVIDERS, capturedForm, isAppUrl, publicState } from "./protocol.js";

// All transitions are serialized. storage.session holds metadata only, surviving
// MV3 worker suspension but not browser restart. Captured Form Data is never saved.
export function createConnector(api, config, { now = Date.now, uuid = () => crypto.randomUUID() } = {}) {
  let queue = Promise.resolve();
  const serial = (fn) => { const task = queue.then(fn, fn); queue = task.catch(() => {}); return task; };
  const read = async () => (await api.storage.session.get("connection")).connection;
  const write = (state) => api.storage.session.set({ connection: state });
  const owned = (state, sender) => state && sender.id === api.runtime.id && sender.frameId === 0 && sender.tab?.id === state.appTabId && sender.documentId === state.appDocumentId && isAppUrl(sender.url, config.origin);
  const appSender = (sender) => sender.id === api.runtime.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id) && Boolean(sender.documentId) && isAppUrl(sender.url, config.origin);
  const consentSender = (state, sender) => state && sender.id === api.runtime.id && sender.frameId === 0 && sender.tab?.id === state.popupTabId && sender.url === api.runtime.getURL("confirm.html");
  const clearInfoldLogin = () => api.browsingData.remove({ origins: [
    "https://loveanddeepspace.infoldgames.com",
    "https://infinitynikki.infoldgames.com",
    "https://passport.infoldgames.com",
  ] }, { cookies: true, localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true });
  async function finish(state, status, message = "") {
    await write({ ...state, status, message, endedAt: now() });
    if (state.popupTabId != null) await api.tabs.remove(state.popupTabId).catch(() => {});
  }
  async function expire(state) {
    if (state && ACTIVE.has(state.status) && (state.status === "submitting" ? now() - state.submittedAt > 75000 : state.expiresAt <= now())) {
      await finish(state, "expired", "หมดเวลาเชื่อมบัญชี กรุณาตรวจสถานะ Login ในเว็บแล้วลองใหม่");
      return read();
    }
    return state;
  }
  return {
    message: (message, sender) => serial(async () => {
      let state = await expire(await read());
      if (appSender(sender)) {
        if (message.action === "ping") return { version: VERSION, providers: Object.keys(PROVIDERS) };
        if (message.action === "status") return publicState(owned(state, sender) ? state : null);
        if (message.action === "begin") {
          if (!Number.isSafeInteger(message.sourceId) || message.sourceId <= 0) throw Error("Source ไม่ถูกต้อง");
          const provider = message.provider || "infold";
          if (!Object.hasOwn(PROVIDERS, provider)) throw Error("ส่วนขยายไม่รองรับผู้ให้บริการนี้");
          if (state && ACTIVE.has(state.status)) throw Error("มีหน้าต่างเชื่อมบัญชีเปิดอยู่ กรุณาทำให้เสร็จหรือยกเลิกก่อน");
          const popup = await api.windows.create({ url: api.runtime.getURL("confirm.html"), type: "popup", width: 560, height: 660, focused: true });
          if (!Number.isInteger(popup.tabs?.[0]?.id)) throw Error("เปิด popup ไม่สำเร็จ");
          state = { flowId: uuid(), appTabId: sender.tab.id, appDocumentId: sender.documentId, sourceId: message.sourceId, provider,
            popupTabId: popup.tabs[0].id, windowId: popup.id, status: "confirming", expiresAt: now() + 10 * 60 * 1000, attempts: 0 };
          await write(state);
          await api.alarms.create("russia-check-expiry", { periodInMinutes: 0.5 });
          return publicState(state);
        }
        if (!owned(state, sender)) throw Error("ไม่พบการเชื่อมบัญชีจากหน้านี้");
        if (message.action === "cancel") {
          if (state.status === "submitting") throw Error("กำลังตรวจสอบและบันทึก กรุณารอผล");
          if (ACTIVE.has(state.status)) await finish(state, "cancelled", "ยกเลิกการเชื่อมบัญชีแล้ว");
          return publicState(await read());
        }
        if (message.action === "complete" && message.flowId === state.flowId && state.status === "submitting") {
          if (message.ok === true && Number.isInteger(message.packCount) && message.packCount > 0) {
            await finish({ ...state, packCount: message.packCount }, "completed", "ตรวจสอบและบันทึก Login แล้ว");
          } else if (message.retryLogin === true && state.attempts < 10) {
            await write({ ...state, status: "waiting", message: "ยังไม่พร้อม กรุณา Login และเลือกตัวละครให้เห็นแพ็กใน popup" });
          } else await finish(state, "failed", typeof message.error === "string" ? message.error.slice(0, 500) : "เชื่อมบัญชีไม่สำเร็จ กรุณาลองใหม่");
          return publicState(await read());
        }
      }
      if (consentSender(state, sender)) {
        if (message.action === "describe") return { origin: config.origin, freshLogin: Boolean(PROVIDERS[state?.provider || "infold"]?.freshLogin), ...publicState(state) };
        if (message.action === "approve" && state.status === "confirming") {
          if (PROVIDERS[state.provider || "infold"].freshLogin) await clearInfoldLogin();
          await write({ ...state, status: "waiting" });
          await api.tabs.update(state.popupTabId, { url: PROVIDERS[state.provider || "infold"].storeUrl });
          return { ok: true };
        }
        if (message.action === "cancel") { await finish(state, "cancelled", "ยกเลิกการเชื่อมบัญชีแล้ว"); return { ok: true }; }
      }
      throw Error("ไม่อนุญาตคำขอนี้");
    }),
    capture: (details) => serial(async () => {
      const state = await expire(await read());
      const formData = capturedForm(details, state, now());
      if (!formData) return;
      await write({ ...state, status: "submitting", submittedAt: now(), attempts: state.attempts + 1, message: "กำลังตรวจสอบและบันทึก Login" });
      try {
        // Only the originating isolated content script receives this secret;
        // never post it to the web page or send it to an extension-chosen URL.
        const ack = await api.tabs.sendMessage(state.appTabId, { type: "russia-check-capture", flowId: state.flowId, sourceId: state.sourceId, formData }, { documentId: state.appDocumentId });
        if (!ack?.accepted) throw Error();
      } catch { await finish(state, "failed", "หน้า GameInfo ถูกปิดหรือเปลี่ยน กรุณากลับไปเชื่อมบัญชีใหม่"); }
    }),
    tabClosed: (tabId) => serial(async () => {
      const state = await read();
      if (state && ACTIVE.has(state.status) && [state.appTabId, state.popupTabId].includes(tabId) && state.status !== "submitting") {
        await finish(state, "cancelled", "หน้าต่างเชื่อมบัญชีถูกปิด");
      }
    }),
    tick: () => serial(async () => {
      const state = await expire(await read());
      if (!state || !ACTIVE.has(state.status)) {
        if (!state || (state.endedAt && now() - state.endedAt > 600000)) {
          await api.storage.session.remove("connection");
          await api.alarms.clear("russia-check-expiry");
        }
      }
    }),
  };
}
