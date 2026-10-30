// Read-only: orders filled by hand on every channel, and the wallet each one
// probably came out of (a drop of the same amount at the same time).
//
//   node scripts/inventory-manual-fills.mjs --from 2026-10-21 --to 2026-10-27
//   node scripts/inventory-manual-fills.mjs --from 2026-10-26 --channel wavepay
//
// --channel      a provider (wavepay, razer, ...) or a payment_method (TrueMoney, ...)
// --limit        rows to print per list (default 50)
// --full         print whole e-mail addresses / phone numbers
// --with-ledger  also mark orders already recorded as hand use in the inventory ledger
//                (reads the tools DB and creates the ledger tables if missing)
// --json         machine-readable output
// The bot database is opened with default_transaction_read_only=on.
import "./register-app-alias.mjs";
import env from "@next/env";
import pg from "pg";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback = "") => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback; };
const dateFrom = option("from"), dateTo = option("to", dateFrom);
if (!dateFrom) {
  console.error("ใช้: node scripts/inventory-manual-fills.mjs --from YYYY-MM-DD [--to YYYY-MM-DD] [--channel wavepay]");
  process.exit(2);
}
if (!process.env.PROFIT_DATABASE_URL) { console.error("ไม่พบ PROFIT_DATABASE_URL"); process.exit(2); }

const remote = new pg.Pool({
  connectionString: process.env.PROFIT_DATABASE_URL, ssl: false, max: 1,
  connectionTimeoutMillis: 8000, query_timeout: 60000,
  options: "-c default_transaction_read_only=on -c statement_timeout=60000",
});
const select = async (sql, params) => (await remote.query(sql, params)).rows;
const { createManualFillCheck } = await import("../src/server/inventory-ledger-manual.js");
const { manualFillsText, manualFillsJson } = await import("./lib/inventory-manual-fills-format.mjs");
const ledger = flag("with-ledger") ? (await import("../src/server/inventory-ledger.js")).inventoryLedger : null;
const actor = { id: 0, username: "cli-check", permissions: ["projectm.claim"] };
const options = { fullLabel: flag("full"), limit: Number(option("limit", "50")) || 50 };

try {
  const report = await createManualFillCheck({ select, ledger }).list(actor, {
    dateFrom, dateTo, channel: option("channel"), withLedger: flag("with-ledger"),
  });
  console.log(flag("json") ? JSON.stringify(manualFillsJson(report, options), null, 2) : manualFillsText(report, options));
  if (Object.keys(report.checkErrors).length) process.exitCode = 1;
} catch (error) {
  console.error(`ตรวจไม่สำเร็จ: ${error.message}`);
  process.exitCode = 1;
} finally {
  await remote.end();
  if (ledger) await (await import("../src/lib/db.js")).getPool().end().catch(() => {});
}
