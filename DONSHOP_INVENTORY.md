# (IDR) Donshop Inventory

Route: `/projectm/th/topup-inventory/donshop`; read-only API `/api/projectm/donshop`.
Access requires a signed-in user with `projectm.claim` or `projectm.admin`.

## Sources and accounting

- `codashop_orders` with exact payment method `DonShopIDR`, every status (`completed`, `manual`, `failed`, `pending`, `wait`), filterable by one status.
- IDR out comes from `provider_response._worker_meta.live_cost_total`, falling back to `live_cost × quantity`. Only `completed` fills count as IDR out, cost, sale or profit; other statuses are listed for review with the bot's quoted price, never summed.
- Linked `inventory_transactions` are all `SYSTEM` / `NONE` placeholder lots, so they are not read. Cost THB = IDR out × selected THB/IDR reference rate (default `0.0019`). It is a reference, not a locked purchase rate, and changing it changes only the screen/CSV.
- Customer receipts reuse the Plsbuy / Garena Shell matching (`telegram_orders_dev`, `sheet_jobs` marketplace rows, sale FX). Unknown or conflicting receipts show — and are not guessed. Web/PAGE orders whose sale key does not match the pack count currently show no sale.
- Balance card: the latest completed order's `balance_before − IDR out`, independent of filters. It is the wallet after that order, not a live provider read, and does not include later top-ups. Per-order history shows the same before/after for its latest completed fill.
- The existing `/profit/donshop-history` page and its overrides are unchanged.

## Balance checks

The "เช็คยอดเงินไม่ตรง" box on the Donshop page lists where the IDR wallet does not add up, with the order, the expected and actual balance and the likely cause. It reads the same rows (SELECT only) and writes nothing anywhere; alerts show only inside that box, never on the Topup Inventory home or as browser pop-ups.

- Continuity: every DonShopIDR row in the date range, all statuses, in the order the bot started them (`COALESCE(fill_started_at, created_at), id`). `fill_started_at` is when `balance_before` was read. On full history this order gives 3 fewer false drops (about 1M IDR) than creation order. Rows are selected by `created_at` through its index, with one extra day of earlier rows as context (a fill starts at most 4h17m after creation, as of 2026-10-23), plus the last completed fill before that as the anchor. Single-day reports matched the full-range alerts exactly for every day from Aug to Oct 2026. A completed fill's `balance_before` should equal the previous completed fill's `balance_before − IDR out`, minus completed fills in between that logged no `balance_before`. Status and search filters do not narrow it.
- `charged` (คิวไม่สำเร็จ แต่โดนหักเงิน): the drop equals one failed/manual/pending/wait fill's quoted price, or all of them together, so that fill was probably charged but is not counted as IDR out or cost.
- `gap` (เงินหาย ไม่ทราบสาเหตุ): any other drop. No bot row explains it: spent outside the bot or the bot logged too little IDR out.
- `refunded` (หักแล้วได้คืน): a `gap`/`charged` drop that the very next link gives back by exactly the same amount. Shown as one note instead of a loss plus a top-up, left out of the money-lost total, and hidden by default.
- `evidence` (ข้อมูลไม่พอให้เช็ค): a completed fill with no `balance_before` or no IDR out, so that link cannot be checked. Hidden by default.
- `topup` (เงินเพิ่ม): a rise, assumed to be a top-up. The DB has no Donshop top-up record to confirm it, so it is hidden by default.

Missing customer receipts are not an alert: they are not missing wallet money and stay in the "ข้อมูลไม่ครบ" line under the totals.

Late entry: every refresh re-checks the whole range, so a row filled in or corrected later changes the result. An alert names the rows around it whose `updated_at` is 30+ minutes after `created_at` ("มีคนแก้ข้อมูลภายหลัง"). The DB keeps only the last `updated_at`, not who changed what, and slow bot retries also count. Ids follow `created_at` for every DonShopIDR row, so no backdated inserts were seen (checked 2026-10-23). During one page session, alerts that disappear after a refresh are listed under "หายไประหว่างเปิดหน้านี้", and alerts that appear are marked "ใหม่". Both reset when the filters change and are not stored.

Alert amounts show IDR without decimals plus an approximate THB in brackets at the page's reference rate. This applies to the alert box only; tables, totals and CSV are unchanged.

Settings (on/off, which kinds, minimum IDR difference) are kept in the viewer's browser storage only.

## Time zone

`codashop_orders.created_at`/`updated_at` are `timestamp without time zone` holding the DB's local time (`TimeZone` = Asia/Bangkok). This page selects them as `col AT TIME ZONE current_setting('TimeZone')`, so they arrive as exact instants and show the same Thai time whatever time zone the Node server runs in. The date filter and the alert range cut are also done in SQL. Other pages that read these columns directly still depend on the server's time zone.

## Features

Thai date range (up to 93 days), status filter, order/queue/game/operator search (queue ids match the balance alerts), 100 customer orders per page, expandable fill evidence and CSV for all filtered results. CSV escapes untrusted formulas. Limit: 20,000 bot rows per report.
Auto-refresh polls the same filtered view every 30 seconds while the tab is visible (toggle on the page), keeps the current table during a refresh and skips a tick while a request is in flight. It is polling, not push: no trigger or `LISTEN/NOTIFY` is added to the shared database. Queries select explicit safe fields only.

No migration, new environment variable, worker, provider request or write is added.

Validation: `node --import ./tests/register.mjs tests/donshop-inventory-tests.mjs`, `npm test`, targeted ESLint.
