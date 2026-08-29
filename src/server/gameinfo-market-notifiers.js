// v1 intentionally uses only the in-app alert store. Additional transports
// (for example Telegram) can implement this interface without changing alerts.
const notifiers = [];

export function registerGameinfoMarketNotifier(notifier) {
  if (!notifier || typeof notifier.notify !== "function") throw new Error("Notifier ต้องมี notify(payload)");
  notifiers.push(notifier);
  return () => {
    const index = notifiers.indexOf(notifier);
    if (index >= 0) notifiers.splice(index, 1);
  };
}

export async function notifyGameinfoMarketAlert(payload) {
  return Promise.allSettled(notifiers.map((notifier) => notifier.notify(payload)));
}
