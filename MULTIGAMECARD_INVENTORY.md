# Multigamecard Topup Inventory

Path: `/projectm/th/topup-inventory/multigamecard`, linked from Topup Inventory.
Includes separate **Bot** and **Manual** tabs. Uses the existing Projectm theme and permissions.

## Reference and units

The supplied workbook's `ตรวจสอบMultiGame Card` has Serial, duplicate, owner,
incoming, outgoing, remaining and external-balance columns; H4/T4 classify
zero as depleted, below 50,000 as small remainder and 50,000 or above as normal.
The Manual/Bot history tabs have order, customer payment, cost, profit and
profit percentage, plus card usage and serials.

The website deliberately labels card values as **points**, not USD: that is
the unit returned by MOL redemption captures and the bot card pool. Do not
apply an unverified USD/points conversion. The user-confirmed Bot cost formula
is redeemed points / 33.31534305, rounded half-up to THB cents per order.
This fixed divisor is not GoogleFinance or a live exchange rate and applies
to all displayed Bot history; previous displayed costs/profits are recalculated.
Profit = customer THB payment − THB cost;
margin = profit / customer payment × 100. Zero sales have no percentage.
Missing sales/costs make the dependent summary unavailable, not zero.

The workbook is a reference only: it is not edited, imported into the database
or used as a live data feed. Its formulas already contain cached errors in
some ranges. No redeemable PINs, account logins or original card stock are
copied into the application or this document.

## Bot: live, read-only

- `PROFIT_DATABASE_URL` uses the existing remote SELECT adapter. No remote writes.
- The `oxide_payment_card` setting is projected inside SQL to serial, balance,
  enabled and balance timestamp. `cardPin` and other setting fields are not fetched.
- Only serials currently present in `oxide_payment_card.cards` appear in Bot.
  Successful `codashop_orders` must belong to one of those serials. Removed or
  unknown serials are excluded from cards, history, summaries and CSV, even when
  old MOL captures exist. Failed/pending rows are not counted. No history is deleted.
  A card disabled but still present in the pool remains visible with its disabled label.
- Card remaining is the pool's current snapshot and does not change with date
  filters. An absent timestamp is unknown, not replaced by the page read time.
- Card usage totals all successful historical captures. Missing/malformed point
  readings make the total unknown. No-history cards may genuinely have zero usage.
- Incoming total is unavailable because the current pool snapshot is not a
  verified incoming ledger. It is never inferred by adding balance and usage.
- An empty pool returns empty cards/history rather than showing historical cards.
  Duplicate serials are flagged
  and no arbitrary duplicate balance is selected.
- Per-order redeemed/remaining points come from MOL captures. These are not
  guaranteed to form a sequential running balance under concurrent redemptions.
- Sale fields reuse `attachSheetFields` and `prepareCodaSales`, including
  splitting one customer's payment across completed packs. Foreign sales use
  the existing current reference quote; unlike USDCodashop it is not frozen.
- THB cost uses `payment.molGameCard.redeemPoints / 33.31534305`.
  Missing/malformed point readings keep cost/profit unavailable, not zero.
  Neither `inventory_transactions.cost_thb` nor `telegram_orders_dev.price`
  overrides this formula. Telegram prices remain on the sale side.
  Summary and CSV use the same per-order rounded costs; CSV includes the formula.
  Manual entries retain their explicitly entered THB costs.

## Manual: local append-only accounting

Uses the **tools application's own database** (`getPool`), never the bot DB:

- `gamedb_mgc_cards`: unique serial, owner, total incoming/outgoing, current points,
  creator and created time. No PIN column. Incoming − outgoing = balance is a DB constraint.
- `gamedb_mgc_entries`: immutable opening/deposit/use entries, request UUID/hash,
  order reference, amount, balance after, approved details and authenticated actor.
- Tables/index are created lazily under the usual advisory schema lock; no new env
  settings or separate migration command is required. The app DB account must have
  the same table-creation permission used by the existing inventory.
- Adding a card records the verified current balance as opening points, even zero.
  Opening balance is not a historical purchase receipt; no backdated history is fabricated.
- Deposit/use require a positive point amount and a reference note. Use requires
  an order ID; optional sale and cost are typed in THB. Blank is different from zero.
- Actions record accounting only: they do not top up a game, redeem a card, pay a
  provider, modify the bot card pool, or mark an external order completed.
- An authenticated Projectm admin is required for POST; viewers can read only.
- A transaction plus row lock prevents overdraw. A request advisory lock and unique
  UUID prevent concurrent request replay; actor/hash mismatches produce conflict.
- New events do not rewrite previous balances or details. There is no delete or
  balance-overwrite button. Source errors roll back the card and entry together.
- Server timestamp is authoritative; updates to owner/status, history imports,
  corrective reversals and integrating Manual with provider redemption are not included.

## Reading, filters and CSV

Both tabs use inclusive Thai calendar dates mapped to exclusive end timestamps,
maximum 93 days and 20,000 rows, then search/Serial selection, summaries and
pagination at 100 rows. CSV includes every matching row, not just the current
page. Card totals stay global; the THB summary uses the current filters.

Dates, serial and query values are validated and parameterized. Export escapes
quotes and formulas, preserves Thai with a BOM, and uses no-store responses.
Only HTTPS source links without embedded credentials are returned as links.
The UI refreshes every 30 seconds when visible, pauses during Manual entry,
preserves the same request UUID on retry and hides stale rows after changing filters.

## Verification

```powershell
npm test
npm run build
node --import ./tests/register.mjs tests/multigamecard-api-tests.mjs
$env:PGLITE_MODULE='C:/Users/inbla/AppData/Local/Temp/coda-report-sql-check/node_modules/@electric-sql/pglite/dist/index.js'
node --import ./tests/register.mjs tests/multigamecard-manual-sql.mjs
node --import ./tests/register.mjs tests/multigamecard-bot-sql.mjs
node --import ./tests/register.mjs scripts/multigamecard-smoke.mjs
```

PGlite tests are isolated, disposable databases; browser tests use mocked HTTP.
They do not verify the production connection/schema or import real cards.
Build, lint and these tests do not mean the code has been pushed/deployed.
Production smoke after deployment should first read Bot and verify source
coverage with a known card. Create Manual data only with an authorized real
opening balance, or use staging for trial entries.
