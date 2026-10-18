import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// Moves iTunes orders from the order sheets into the iTune email ledger every minute.
// Reads Google Sheets only; never writes back to a sheet.
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
if (!process.env.ITUNE_SHEETS_CREDENTIALS || process.env.ITUNE_SHEET_SYNC_ENABLED === "false") {
  console.log("[itune-sheets] disabled: set ITUNE_SHEETS_CREDENTIALS (and not ITUNE_SHEET_SYNC_ENABLED=false)");
  process.exit(0);
}
const { createItuneSheetSync } = await import("../src/server/itune-sheet-orders.js");
const INTERVAL_MS = 60_000;
const sync = createItuneSheetSync();
let timer; let stopping = false; let running = null;

async function tick() {
  if (stopping) return;
  running = (async () => {
    try {
      const s = await sync.run();
      console.log(`[itune-sheets] days=${s.days.join(",")} found=${s.found} imported=${s.counts.imported} waiting=${s.waiting.length} errors=${s.errors.length}`);
      for (const e of s.errors) console.log(`[itune-sheets] ${e.source}: ${e.message}`);
    } catch (error) {
      // pg/network errors can carry connection strings: log only a code.
      console.error("[itune-sheets] run failed", error?.status || error?.code || "ERROR");
    }
  })();
  await running; running = null;
  if (!stopping) timer = setTimeout(tick, INTERVAL_MS);
}
async function shutdown() {
  if (stopping) return;
  stopping = true; clearTimeout(timer);
  const deadline = setTimeout(() => process.exit(1), 20_000); deadline.unref();
  await running; process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log("[itune-sheets] started; reads sheets every 60 seconds (older days every 30 minutes)");
await tick();
