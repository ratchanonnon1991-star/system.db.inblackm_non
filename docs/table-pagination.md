# GameDB table pagination — 2026-11-03

The audit covers all 94 native/shadcn table instances in 63 source files. Existing pagers are retained; unpaged record tables now use a shared logical-record pager. Three small schema/sample tables remain bounded single-page previews. The per-table inventory is in `table-pagination-coverage.json`.

## User behavior

- New pagers start at 25 records and offer 25/50/100/200, first/previous/next/last, visible ranges, total records, disabled loading controls and accessible names. Tables with at most 25 records need no extra local controls. Existing specialized pagers retain their own supported sizes.
- Search/filtering/sorting happens over the full supplied collection before slicing. Filter changes reset the page. Deleting the last record clamps the page. Draft editors keep their original collection indices; selected records and bulk actions retain their full collections.
- Grouped orders are paginated as whole records, including their fills/detail rows. Full-report totals, missing/unknown financial values and CSV exports retain their existing meaning.
- System DB keeps its existing result pagination/virtualization and complete bounded query result for formulas/lookups. Arbitrary SQL is not silently rewritten with a new LIMIT.

## Network and database work

| Area | Behavior |
| --- | --- |
| USD Codashop ledger | Page size reaches the existing SQL LIMIT/OFFSET, with page-only fill JSON. Default client size is 25; legacy API callers still default to 100. CSV ignores the UI size and preserves its export limit. |
| Other nine provider histories | Initial filtered report uses the existing complete export/read path, then returns one page. Page navigation reuses an explicit short-lived server snapshot. Changes to filters, manual refresh, polling and post-write reloads read fresh reports. |
| Twelve Profit histories | Existing full history feeds are evaluated on the server. Search/date/game/platform/order filters and sort precede slicing; only the requested page and full option lists reach the browser. Navigation/filtering may reuse the same full-feed snapshot. Manual refresh or post-edit reload creates a new report. Browser date inputs are sent as epoch milliseconds to preserve the previous local-time behavior. |
| Profit card detail variants | Existing full financial aggregation is preserved. The API returns only the selected orders page while retaining the full card totals. GoCash search examines the full order collection. |
| Existing GameInfo catalog/comparison/alerts, Razer accounts, logs and other specialized tables | Keep their existing paging. No nested pager is added to a server-paged result. |
| Configuration, imports, Stock, Workforce, other small tables | Client pagination reduces rendered DOM rows. It does **not** reduce the initial HTTP/DB read. Existing endpoint caps (e.g. 200/300/500 recent records) remain caps, not an assertion that older history is now retrievable. Existing truncation notices remain visible. |

Snapshots are explicit tokens scoped to current user ID, role, effective permissions and report/filter context. Every API performs current authorization before lookup. Tokens expire for reuse after two minutes; the process-local LRU retains at most 16 entries/32 MiB, at most 24 MiB per entry. Oversized reports are returned uncached without truncation. Multi-process routing or expired/evicted tokens simply reloads the report. Errors release the in-flight slot. No database schema/index or permission policy was changed.

The snapshot improves subsequent page reads and response size; it does not claim to make the first underlying financial report query cheaper. Production timings have not been measured in this change.

## Verification

Final local run: **177 suites, 7,225 assertions, zero failed suites**; production build passes. Changed-source lint has zero errors and eight pre-existing effect warnings. `git diff --check` passes.

- `node tests/run.mjs`: complete repository suites, including pagination bounds, ownership/grant/scope/TTL isolation, concurrent reads, budget overflow, filter/date behavior for all twelve Profit histories, actual history/card API paths and current-access denial before cached reads.
- SQL/PGlite parity uses the frozen pre-performance query as the financial oracle, now also at 25/50/200 rows. Concatenated SQL pages match the full report's records, complete grouped fills and unchanged summaries; export remains complete.
- Actual initial renders of all ten Inventory clients exercise hook initialization and the empty/loading state without network effects.
- Browser QA uses actual Profit history/card, WavePay and shared editor components with synthetic HTTP data. Checks include second page, page size 50, global search, editing record 26, and deleting record 51 from the last page. WavePay page 1 then page 2 performs one synthetic report load, not two.
- Local preview: `node --import ./tests/register.mjs scripts/pagination-preview.mjs`, then `http://127.0.0.1:4193/profit`. Every record is fake and business writes are rejected. No authentication bypass was added to application routes.

Source and local-fixture verification are not production deployment evidence.

## Follow-up review — 2026-11-04

- Completed reset context for card-system/price-status filters in Profit, GameInfo mapping status/data mode/game/market, Russia pack filters, customer-form tabs, provider alerts and account summaries. Stock item paging stays in place when only the separate movement-history filter changes. Opening a comparison's pack detail or filtering its seller menu also keeps the table's current page.
- Profit's prepared date/order index and filter-option lists are reused within the authorized immutable snapshot. Stable timestamp ties retain feed order. Malformed legacy dates use the former filter-then-sort behavior. A fresh report receives a fresh index; the weak cache does not keep evicted reports alive.
- The shared resource hook marks rows busy/inert as soon as the requested view changes, including the search debounce interval. Manual refresh immediately cancels the previous read and invalidates its generation, so a late reply cannot restore an obsolete snapshot token. Switching resources does not show the previous card's records.
- The debit draft table uses controlled paging: Enter at a page boundary reveals the next record and focuses its order field. Adding record 26 after 25 records opens page 2. Returning to page 1 and pressing Enter on record 25 reveals existing record 26 without creating another row. Draft values, full-collection totals and existing save/duplicate guards remain in the parent.
- Added accessible filter names and distinct GameInfo/Market status-tab names.

Additional verification: independent indexed-history parity cases cover all twelve providers, both sort orders, ties, missing tags, inclusive dates and malformed legacy dates. Hook scheduler tests cover immediate busy state, aborted/late replies, fresh refresh tokens, error recovery and resource changes. Browser checks use actual components with synthetic data, including 1.5-second HTTP delay, source/status filters on page 2, and the debit keyboard flow. The preview's only extra POST is a fake metadata lookup; ledger/payment writes remain rejected.
