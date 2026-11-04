import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
if (process.env.TOPUP_INVENTORY_ALERTS_ENABLED !== "true") {
  console.log("[inventory-alerts] disabled: set TOPUP_INVENTORY_ALERTS_ENABLED=true");
  process.exit(0);
}
const { inventoryAlerts, telegramConfigured } = await import("../src/server/inventory-alerts.js");
if (!telegramConfigured()) {
  console.error("[inventory-alerts] missing TOPUP_TELEGRAM_BOT_TOKEN or TOPUP_TELEGRAM_CHAT_ID");
  process.exit(1);
}
let stopping = false, timer, running;
async function tick() {
  if (stopping) return;
  running = (async () => {
    try { console.log("[inventory-alerts]", JSON.stringify(await inventoryAlerts().run())); }
    catch (error) { console.error("[inventory-alerts] failed", error.code || "ERROR"); }
  })();
  await running;
  if (!stopping) timer = setTimeout(tick, 60_000);
}
async function shutdown() {
  stopping = true; clearTimeout(timer);
  setTimeout(() => process.exit(1), 20_000).unref();
  await running; process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
await tick();
