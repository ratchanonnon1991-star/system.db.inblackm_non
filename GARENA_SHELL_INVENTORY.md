# Garena Shell Inventory

Route: `/projectm/th/topup-inventory/garena-shell`. The hub links to it.

Only `InblackShell1 (InblackRB2c)` and `InblackShell2 (InblackWFH1z)` are included.
Match `codashop_orders.provider_response.garena_username` case-insensitively after trimming;
never infer membership from `garena_account_index`, phone number, or another account's history.

The existing `PROFIT_DATABASE_URL` is used for SELECT-only access. No migration, new credential,
provider call, dispatch, inventory debit, or local ledger write is performed by this feature.
Only completed `GarenaShells` rows are included. Unknown usernames and other accounts are excluded.
No complete provider response, session, cookie, password or settings secret is selected or returned.

The primary balance is the latest completed bot row's `shell_balance_after` (falling back to
`shell_balance` when absent). Its observation date and source order are shown. It is a last-known
bot observation, not a fresh Garena wallet query. Account cards always remain separate, even when
one account has no activity or no known balance. Missing balances remain unavailable.

Actual Shell usage is before minus after, with `shell_used` as fallback if that pair is absent.
Contradictory amounts or an increasing balance in a spend observation remain unavailable;
`shell_cost_expected` is never used as actual usage. Cost = actual Shell out × 0.625 THB,
rounded half up to satang. Profit = customer payment THB − cost; margin = profit / payment × 100.
Customer payment fields reuse the existing inventory listing-field and sale-conversion helpers.
Transport rows are first matched against the original order prefix (before `:`). Purchased-unit
suffixes such as `/1` and `/2` are preserved for both sale identity and pack-count grouping; they
must not be collapsed into a parent sale or each other. If no
exact source match exists, a reused task with conflicting sale evidence stays unavailable.
Multi-pack counts are calculated from distinct Codashop rows sharing that original order,
not from a task-only join; duplicate transport records cannot multiply quantities or prices.
Foreign-currency payments use the existing sale-rate service and are not silently treated as THB.

Reference: user-provided workbook `1.1 UID (  SMILEONE , GARENA,My CARD ).xlsx`,
`ตรวจสอบยอดคงเหลือ!A4:G5`, Shell1's `E3=I3*0.625` / `G3=F3/D3*100`, and Shell2's corresponding row 4 formulas.
The supplied summary amounts are separately labelled sheet references with no confirmed cutoff.
They are never used as opening balances or subtracted from bot history. The Netease total of 901.67
from a different section of the worksheet is not a Garena balance and is not imported.

History supports Thai-calendar date bounds (up to 93 days), account/search filters, 100-row pages,
and CSV export of all filtered rows (at most 20,000). Summary totals cover all filtered rows, not
just the visible page. Any unknown amount makes its dependent total unavailable, not a partial zero.
CSV escapes spreadsheet-formula prefixes. Native browser GET/page and API permissions require
Projectm admin or claim access; existing authentication is retained. No save or top-up API is added.

Tests: `node --import ./tests/register.mjs tests/garena-shell-inventory-tests.mjs` and
`node --import ./tests/register.mjs tests/garena-shell-api-tests.mjs`.
Optional SQL integration: set `PGLITE_MODULE` to an installed `@electric-sql/pglite/dist/index.js`, then
run `node --import ./tests/register.mjs tests/garena-shell-sql.mjs`. This uses a disposable in-memory database.
UI smoke: after a build, run `node --import ./tests/register.mjs scripts/garena-shell-smoke.mjs` (headless Chrome).
