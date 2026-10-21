# USDCodashop grouped customer orders

## Receipt repair

`inblackm_web` is a native THB source. Customer sale remains the recorded `telegram_orders_dev.price`, not a fabricated transfer or a USD conversion. For IN881415-6099-1, the read-only diagnostic found bot id 293735, WEB-IN881415-6099-1 and native price 72.50. No live records were changed during diagnosis or implementation.

Completed queue matching now uses the existing safe lateral sale lookup: exact source order preferred when a task is reused; conflicting receipts remain unknown. Customer prices are converted in full before allocating exact satang by global completed bot-row position, including siblings outside the current page/date/provider. Missing allocation evidence is not guessed. Stored sale quotes remain locked under the existing audit/replay policy. The existing automatic sync updates metadata without inserting another USD debit; existing rows require the next successful sync before repaired receipts appear.

## Display and totals

- One order row per exact customer order label AND source. `/1` and `/2` are not stripped; only provider `:...` dispatch suffixes are normalized. Unknown source is not grouped with other unknown-source orders.
- All fills are grouped before search/date/profit filters, pagination and CSV. The displayed/filter date is the last fill's timestamp; a date match includes the whole customer order, not a misleading partial sum.
- Add allocated THB sale and actual USD debits. Reference cost is the combined USD debit × current USDTHB quote, rounded once; profit/margin are calculated on that combined basis.
- Use the last fill's provider balance, never sum balances or substitute an older balance if the latest is unknown. The global wallet running balance and raw ledger debits are unchanged.
- Multiple legitimate fills no longer mean "duplicate queue". Shared invoice identifiers remain flagged as transaction duplicates, including inside a group. Their actual recorded debits remain visible for reconciliation; no automatic deletion, refund or hidden financial deduplication is performed.
- Expand to see every queue, invoice, allocated sale, reference cost, debit and post-fill balance. CSV includes fill count and safe structured fill evidence. Conflicting/missing sales remain unknown, not zero.

No migration or new environment variable. Deploy Tools and allow the existing sync worker to complete a successful pass (or use the existing authorized sync button); never replay a provider purchase or re-consume historical orders.

Validation: `npm test`; targeted ESLint/build; isolated PostgreSQL-compatible `tests/usdcodashop-group-sql.mjs`, `tests/usdcodashop-ledger-sql.mjs`, `tests/usdcodashop-sale-conversion-sql.mjs`. Set PGLITE_MODULE to an installed PGlite module path for optional SQL tests. Browser smoke: `node --import ./tests/register.mjs scripts/usdcodashop-ledger-smoke.mjs` (synthetic data only).
