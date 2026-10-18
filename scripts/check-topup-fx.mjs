import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const { loadTopupGoogleRate } = await import("../src/server/topup-googlefinance-rate.js");
if (!process.env.TOPUP_FX_SHEETS_CREDENTIALS) {
  console.error("Missing TOPUP_FX_SHEETS_CREDENTIALS in server environment/.env"); process.exitCode = 1;
} else {
  const quote = await loadTopupGoogleRate();
  if (!quote) {
    console.error("Cannot read GoogleFinance rate. Check credential file permissions, enable Google Sheets API, and share the rate sheet with this service account as Viewer. No fallback rate is used.");
    process.exitCode = 1;
  } else console.log(`OK: ${quote.source} USDTHB=${quote.rate}, read at ${quote.fetchedAt}`);
}
