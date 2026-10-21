# Razer Gold Inventory — first stage (SGD / CAD)

Page `/projectm/th/topup-inventory/razer`; read-only API `GET /api/projectm/razer`.

## Data and safety

- Stock: explicit non-secret fields from existing `profit_razer_accounts` in the Tools database. This page never calls the stock service's schema initializer, account mutations, sync actions, OTP routes or bot endpoints.
- Bot ledger: explicit fields from `razer_purchase_history` via `PROFIT_DATABASE_URL`; only `status='completed'` and exact `currency_code` SGD/CAD. Failed and processing attempts are not treated as debits.
- Wallet identity is normalized email + currency, not the email alone, a numeric position or a guessed game mapping. Missing email purchases remain separate receipt rows.
- Use the later observed balance from Stock (`last_synced_at`) or successful purchase (`balance_received_at`, `completed_at`, `created_at`), never the metadata update time. These are recorded balances, not live wallet checks.
- Stock accounts missing from purchase history remain visible. History-only accounts are marked `UNVERIFIED`; do not assume they are enabled or ready for bot use. Stock credentials/OTP/session/lease secrets are never returned or exported.
- If stock lookup fails, the response explicitly sets `stockAvailable=false` and the screen warns that only historical wallets are shown. Unknown balances are not replaced with zero. Bot DB errors fail the request with sanitized 503.
- `projectm.claim` / `projectm.admin` access is checked before any source query; linking the existing Stock management page additionally requires `profit.access`.

## Money

- Debit = Gold before − Gold after, checked against reported deducted amount. Contradiction stays unknown. Missing before/after may use a valid explicit deduction.
- Customer sales use the existing ambiguity-safe Telegram/marketplace lookup. Full payment is converted before exact-satang allocation over completed coda packets and completed Razer receipts. Allocation counts use all dates/currencies, not only the visible filter. Preserve `/1` vs `/2` purchase identities.
- Combine fills only within the exact wallet, channel and customer order. Keep expandable receipts and use the final observed balance, never summed balances.
- **Costs/profits are explicitly reference-only in this stage.** Use a valid current per-account Stock rate or an explicitly entered per-zone screen override. No guessed rate, no GoogleFinance impersonation, no historical rate lock implied. Overrides affect screen/CSV only and are reset on reopening.
- Missing sale/cost inputs make dependent summaries unknown, not partial sums disguised as complete totals. Monetary arithmetic uses decimal/BigInt half-up rounding.
- Show SGD and CAD totals separately. Silver is shown separately from Gold. Hidden accounts are excluded by default and can be included explicitly.

## UI and export

Date range (Thai timezone, maximum 93 days), zone, account, account status/ready state, search and hidden-account filters; stock table 50/page, ledger 100/page. CSV exports all filtered ledger rows (not only the current page), includes reference rate/basis, UTF-8 BOM and formula-injection escaping. Guard at 20,000 physical purchase rows and 10,000 stock accounts.

## Not yet included

The uploaded 2026 ZIP has **not** been imported. No sheet opening balances are mixed with bot balances. Historical spreadsheet import, RazerID mapping, manual ledger entries, purchase-lot/historical locked cost rates, additional currencies and background sync are separate next-stage work. No new env vars, migration, worker or database writes are required for this stage.

## Verification

`node --import ./tests/register.mjs tests/razer-inventory-tests.mjs`

`node --import ./tests/register.mjs scripts/razer-inventory-smoke.mjs` (after build; Chrome installed).

Live SELECT-only bot history checks passed. The local workstation's direct Tools DB connection returned authentication failure; production Stock connectivity must be verified on its configured server. Credentials were not modified.
