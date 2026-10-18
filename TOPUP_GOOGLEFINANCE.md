# Multigamecard Russia customer payments: GoogleFinance

Only the Multigamecard Bot Russia/Russia Reseller sale conversion changes.
Customer USD amount = `telegram_orders_dev.price`, joined by task_request_id.
THB customer payment = USD amount × GoogleFinance USDTHB, split across completed
packs by the existing pack-count rule. Costs still use outgoing card points /
the saved cost divisor. No changes to Manual, iTune, USDCodashop or WavePay conversion.

## Server setup

1. Use a Google service-account JSON stored outside the Git checkout/web root,
   readable only by the application user (currently PM2 runs as root).
2. Keep the existing `ITUNE_SHEETS_CREDENTIALS` unchanged. Add to the server `.env`:

   ```dotenv
   TOPUP_FX_SHEETS_CREDENTIALS=/etc/inblackm/your-service-account.json
   ```

3. Enable Google Sheets API for that service account's Cloud project.
4. Share this rate-only sheet with the JSON's `client_email` as Viewer:
   https://docs.google.com/spreadsheets/d/1cyf6BPQa7pLgUzdIX38q85BfXC3jRql94Q5u4p3Lx6M/edit
5. Keep `Rates!B2` as `=GOOGLEFINANCE("CURRENCY:USDTHB")`.
6. After pulling the new code, check access without writing anything:

   ```bash
   cd /www/wwwroot/system.db.inblackm
   node scripts/check-topup-fx.mjs
   ```

   Use the Node executable configured for deployment if `node` is not on PATH.
   Success prints only the rate/provider/read time, never credential contents.
7. Deploy normally with `bash ./deploy-server.sh`. Changing only `.env` requires
   reloading the application; the normal deployment restarts the configured PM2 apps.

Do not commit, expose via public files, or paste JSON/private keys in chat.
Changing service-account keys requires an application restart.

## Read behavior

- Reads exactly `'Rates'!B2` via Sheets values.get, UNFORMATTED_VALUE.
- Dedicated credential, Sheets read-only OAuth scope. No fallback to iTune keys.
- One shared request per process with a 5-minute cache; failed requests retry after
  30 seconds. Never silently substitutes CoinGecko, ECB, a manual rate or zero.
- Missing access, formula errors, nonnumeric/invalid rates leave Russia sale/profit
  unavailable. Card balances and costs remain available. Other channels still work.
- `fetchedAt` means when the app read the cell, not the market quote timestamp;
  GOOGLEFINANCE may update with a delay. Historical displayed sales/profits change
  with the current quote; no historical FX snapshot is created.
- Table details and CSV include currency, rate, provider and read time.

Reference: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get
