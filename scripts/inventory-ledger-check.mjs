// Read-only check: where did a wallet balance move without a bot purchase?
//
//   node scripts/inventory-ledger-check.mjs --provider razer --from 2026-10-20 --to 2026-10-27
//   node scripts/inventory-ledger-check.mjs --provider all --from 2026-10-27
//   node scripts/inventory-ledger-check.mjs --provider wavepay --from 2026-10-27 --account 0977
//
// --provider   razer | netease | wavepay | garena-shell | gamepoint | plsbuy | donshop | all
// --account    only wallets whose key/name contains this text
// --tolerance  ignore gaps up to this amount (e.g. 0.01)
// --limit      wallets to print per provider (gaps first, default 20)
// --full       print whole e-mail addresses / phone numbers
// --with-ledger  also count movements recorded in the inventory ledger
//                (reads the tools DB and creates the ledger tables if missing)
// --json       machine-readable output
// The bot database is opened with default_transaction_read_only=on.
import "./register-app-alias.mjs";
import env from "@next/env";
import pg from "pg";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback = "") => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback; };
const dateFrom = option("from"), dateTo = option("to", dateFrom), provider = option("provider", "all");
if (!dateFrom) {
  console.error("ใช้: node scripts/inventory-ledger-check.mjs --provider <razer|netease|wavepay|garena-shell|gamepoint|plsbuy|donshop|all> --from YYYY-MM-DD [--to YYYY-MM-DD]");
  process.exit(2);
}
if (!process.env.PROFIT_DATABASE_URL) { console.error("ไม่พบ PROFIT_DATABASE_URL"); process.exit(2); }

const remote = new pg.Pool({
  connectionString: process.env.PROFIT_DATABASE_URL, ssl: false, max: 1,
  connectionTimeoutMillis: 8000, query_timeout: 60000,
  options: "-c default_transaction_read_only=on -c statement_timeout=60000",
});
const select = async (sql, params) => (await remote.query(sql, params)).rows;
const { createInventoryCheck } = await import("../src/server/inventory-ledger-check.js");
const { LEDGER_CHECK_PROVIDERS } = await import("../src/lib/inventory-ledger-sources.js");
const { checkText, checkJson } = await import("./lib/inventory-ledger-check-format.mjs");
const ledger = flag("with-ledger") ? (await import("../src/server/inventory-ledger.js")).inventoryLedger : null;
const actor = { id: 0, username: "cli-check", permissions: ["projectm.claim"] };
const options = { fullLabel: flag("full"), limit: Number(option("limit", "20")) || 20 };
const checker = createInventoryCheck({ select, ledger });
const list = provider === "all" ? LEDGER_CHECK_PROVIDERS : [provider];

try {
  const reports = [];
  for (const id of list) {
    try {
      reports.push(await checker.check(actor, { provider: id, dateFrom, dateTo, account: option("account"),
        tolerance: option("tolerance", "0"), withLedger: flag("with-ledger") }));
    } catch (error) {
      // One provider failing (e.g. a table that does not exist) must not hide the others.
      if (list.length === 1) throw error;
      reports.push({ provider: id, error: error.message });
      process.exitCode = 1;
    }
  }
  if (flag("json")) console.log(JSON.stringify(reports.map(r => r.error ? r : checkJson(r, options)), null, 2));
  else console.log(reports.map(r => r.error ? `[${r.provider}] ตรวจไม่สำเร็จ: ${r.error}` : checkText(r, options)).join("\n\n" + "=".repeat(60) + "\n\n"));
} catch (error) {
  console.error(`ตรวจไม่สำเร็จ: ${error.message}`);
  process.exitCode = 1;
} finally {
  await remote.end();
  if (ledger) await (await import("../src/lib/db.js")).getPool().end().catch(() => {});
}
