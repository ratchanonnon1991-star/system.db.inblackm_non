# (MYR) Plsbuy Inventory

Route: `/projectm/th/topup-inventory/plsbuy`; read-only API `/api/projectm/plsbuy`.
Access requires a signed-in user with `projectm.claim` or `projectm.admin`.

## Sources and accounting

- Completed `codashop_orders` with exact payment method `PlsbuyMYR` only.
- MYR used comes from related `inventory_transactions.amount_used`. Missing, negative, unsupported or orphan lot entries invalidate the aggregate rather than creating a partial total.
- Real recorded costs are accepted only when every transaction uses a `PlsbuyMYR` / `MYR` lot. A genuine recorded zero remains zero.
- Existing `SYSTEM` / `NONE` lots contain placeholder zero costs and a shared balance: neither is presented as a real Plsbuy cost/balance. For these rows, the displayed reference cost is MYR used × selected THB/MYR rate (default `7.723`). No ledger is changed.
- Default rate follows the reference workbook `1.9 UID Supplier (TH,IDR,MYR ).xlsx`, `(MYR) PLSBUY` column E (`=I[row]*7.723`). It is not a live FX feed or a historically locked purchase rate.
- Static sheet reference comes from `ตรวจสอบยอดคงเหลือ!D3:F3`: current 14501.04, used 4711.71, remaining 9789.33. These numbers are labelled separately, not used as a live balance or debited again.
- The balance card prefers the latest completed order's `_worker_meta.wallet_balance` observation, tagged `source=plsbuy_api`, `currency=MYR`, with a valid amount and UTC check timestamp. The updated purchase worker must be deployed first and complete a new order with a successful balance read. Old orders are not backfilled; the manually checked 9789.33 is not injected as live data. This is account balance at check time, not a per-order debit or a live request when opening/refreshing the page. The card is independent of report filters.
- If no API evidence exists, wallet-lot remaining is limited to typed `PlsbuyMYR` / `MYR` active/exhausted lots, labelled as lots rather than provider balance. Neither matching lots nor snapshot means unknown, not zero. API observations are never passed to consume again from Tools.
- Customer receipts reuse the existing exact source-order matching and full-payment currency conversion, then allocate satang across all completed fills before filtering/grouping. Different `/1` and `/2` orders remain distinct. Unknown/conflicting receipts are not guessed.
- Profit = sale − cost; margin = profit ÷ sale × 100. Reference costs and profits change when the view rate changes; actual recorded costs do not.

## Features and deployment

Thai date range (up to 93 days), order/game/operator search, 100 customer orders per page, expandable fill evidence and CSV for all filtered results. CSV escapes untrusted formulas. Limits: 20,000 bot rows per report. Queries select explicit safe fields; no raw provider payloads, credentials or secrets are returned.

No migration, new environment variable, worker, sheet import, provider request, stock mutation or automatic debit is added. Existing remote database access is reused. The reference workbook is not modified.

Validation: `node --import ./tests/register.mjs tests/plsbuy-inventory-tests.mjs`, `npm test`, targeted ESLint, `npm run build`. After building CSS, `node --import ./tests/register.mjs scripts/plsbuy-inventory-smoke.mjs` tests mobile/desktop, both themes, pagination, search, rate changes, CSV downloads and failure recovery with synthetic data only.
