# (IDR) AgenH2H Inventory

Route: `/projectm/th/topup-inventory/agenh2h`; read-only API `/api/projectm/agenh2h`.
Access requires a signed-in user with `projectm.claim` or `projectm.admin`.

Built from the Donshop inventory design (branch `donshop-inventory`): AgenH2H bot rows have the same shape (H2H top-up API, `_worker_meta.balance_before` / `live_cost_total`, as in `/profit/agenh2h-history`). The files are standalone (`src/lib|server|components/agenh2h-inventory.js`) and do not depend on Donshop code.

## Sources and accounting

- `codashop_orders` with exact payment method `AgenH2HIDR`, bot-run rows only (`provider_response._worker_meta` is an object, written when the worker takes a queue), every status (`completed`, `manual`, `manual_pending`, `failed`, `rejected`, `pending`, `wait`), filterable by one status. Rows a person filled or re-marked without the bot carry no IDR evidence and are left out of the list, totals, balance card and checks, as on Donshop.
- IDR out comes from `provider_response._worker_meta.live_cost_total`, falling back to `live_cost × quantity`, then the provider's `data.total` (older rows), the same order as `/profit/agenh2h-history`. Only `completed` fills count as IDR out, cost, sale or profit; other statuses are listed for review with the bot's quoted price, never summed.
- Cost THB = IDR out × selected THB/IDR reference rate (default `0.0019`). It is a reference, not a locked purchase rate; changing it changes only the screen/CSV.
- Customer receipts reuse the Plsbuy / Garena Shell matching (`telegram_orders_dev`, `sheet_jobs` marketplace rows, sale FX). Unknown or conflicting receipts show — and are not guessed.
- Balance card: the latest completed order's `balance_before − IDR out`, independent of filters. `balance_after` is not read (live rows often store 0). It is the wallet after that order, not a live provider read, and does not include later top-ups.
- `codashop_orders.source` is often `telegram` (the queue channel) on AgenH2H rows. It is treated as empty so the sales platform comes from `telegram_orders_dev.source`; otherwise those orders would show no customer receipt.
- Invoice: `provider_response.data.invoice` (the Agen H2H API), then the Codashop invoice fields.
- Not read: `profit_agenh2h_overrides` (sale/cost/platform corrections typed on the Profit pages, in the system DB), so a corrected order can show a different sale or cost there.
- Orders filled by hand outside the bot are not in `codashop_orders` and do not appear. That includes the Profit "Manual · Agenh2h (IDR)" games kept in Google Sheets. There is no top-up record, so a rise shows as a `topup` check (hidden by default).
- The existing `/profit/agenh2h-history` page is unchanged.

## Balance checks

The "เช็คยอดเงินไม่ตรง" box chains every AgenH2HIDR row in the date range in the order the bot started them (`COALESCE(fill_started_at, created_at), id`) and flags `gap`, `charged`, `refunded`, `evidence` and `topup`, with the same rules as Donshop. It reads only and writes nothing; settings are kept in the viewer's browser only (`agenh2h-check-settings`). The one-day lookback before the range was measured on Donshop (fills start at most 4h17m after creation) and has not been measured on AgenH2H.

## Not yet checked

Written from code, not checked against live AgenH2H rows: whether `fill_started_at`, `balance_before` and `live_cost_total` are filled on every completed row. Compare the balance card with the sheet (`1.9 UID Supplier (TH,IDR,MYR ).xlsx`, `ตรวจสอบยอดคงเหลือ`: remaining 17,499,206 IDR, last sheet row 2026-10-19) after deploy.

## Features

Thai date range (up to 93 days), status filter, order/queue/game/operator search, 100 customer orders per page, expandable fill evidence, CSV for all filtered results (formula-escaped), 30-second auto-refresh while the tab is visible. Limit: 20,000 bot rows per report.

No migration, new environment variable, worker, provider request or write is added.

Validation: `node --import ./tests/register.mjs tests/agenh2h-inventory-tests.mjs`, `npm test`, targeted ESLint, `npm run build`.
