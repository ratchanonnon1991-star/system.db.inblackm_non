import "./register-app-alias.mjs";
import env from "@next/env";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { AUTO_SYNC_ACTOR, createAutoSyncLoop } from "./lib/usdcodashop-auto-sync.mjs";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
if (process.env.CODASHOP_AUTO_SYNC_ENABLED === "false") {
  console.log("[coda-auto] disabled by CODASHOP_AUTO_SYNC_ENABLED=false");
  process.exit(0);
}

const { getPool } = await import("../src/lib/db.js");
const { createCodaLedger } = await import("../src/server/usdcodashop-ledger.js");
const { createCodaSource } = await import("../src/server/usdcodashop-source.js");
let local; let remote; let repository;
function repo() {
  if (repository) return repository;
  if (!process.env.PROFIT_DATABASE_URL) throw new Error("Missing source configuration");
  local = getPool();
  local.on?.("error", () => console.error("[coda-auto] application connection error"));
  remote = new pg.Pool({
    connectionString: process.env.PROFIT_DATABASE_URL, ssl: false, max: 1,
    connectionTimeoutMillis: 8000, query_timeout: 15000,
    options: "-c default_transaction_read_only=on -c statement_timeout=15000",
  });
  remote.on("error", () => console.error("[coda-auto] source connection error"));
  // A separate read-only source session; all durable writes go to the application DB.
  repository = createCodaLedger(local, createCodaSource(async (sql, params) => (await remote.query(sql, params)).rows));
  return repository;
}
const loop = createAutoSyncLoop({
  run: () => repo().sync(AUTO_SYNC_ACTOR),
  report: (status) => repo().recordWorkerStatus(AUTO_SYNC_ACTOR, status),
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 20_000);
  deadline.unref();
  await loop.stop();
  await Promise.allSettled([local?.end(), remote?.end()]);
  clearTimeout(deadline);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log("[coda-auto] started; checks every 60 seconds after each run; no game topup calls");
await loop.tick();
