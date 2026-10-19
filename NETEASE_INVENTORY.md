# Netease Topup Inventory

Page: `/projectm/th/topup-inventory/netease`.
API: `GET /api/projectm/netease`; same `projectm.claim` / `projectm.admin` access as other inventories.
No new environment variables, migration, worker, dispatch, provider request or database write.

## Sources and identities

- Bot purchases: explicit safe columns from `netease_purchase_history`.
- `old_balance`, `deducted`, `new_balance` determine usage; inconsistent debit evidence remains unknown, not zero.
- Latest recorded `new_balance` is primary, independent of date/search filters. It is not a live wallet request.
- Account metadata and separate reference figures come from the original workbook's `ตรวจสอบยอดคงเหลือ!I2:N3,I8:N13` and each Netease tab. No passwords or PINs are copied.
- Six USD Pay wallets, two USD Credit wallets, one KRW Pay wallet are listed. KRW is never summed with USD.
- Match normalized purchase email and compatible currency. A missing currency may inherit the sheet currency only for a unique account match.
- Pay 2 and Credit 2 share an email; the database has no Pay/Credit field. These purchases remain **unassigned**, not classified by game-name guesses. Credit 1 has no verified purchase email in the sheet. Neither wallet is filled from guessed balances.
- Unassigned records are visible, searchable and exportable, including their original debit and balance; their wallet type, cost and dependent profit remain unknown until a trustworthy mapping is supplied. They are not combined across purchase receipts because their wallet identities cannot be proven equal.
- Sheet references are static, not a seeded opening balance; they are never added to or subtracted from bot figures.

## Money and grouping

Bot coda IDs join sale orders through the existing ambiguity-safe lateral sale lookup. Exact original source IDs, including `/1`, are preserved. Existing marketplace/Telegram sale conversion is reused. Full payments convert first, then allocate exact satang across all completed packets and all purchase receipts for each packet, independent of date/account filters. Multiple fills combine into one row per exact customer order, channel and wallet; final balance comes from the last observed fill, never a sum. Every underlying history ID remains in expandable details.

Reference cost formulas: USD Pay debit × 27.93 THB; Credit 1 × 33.48; Credit 2 × 32.48; KRW debit ÷ 47.69. These are explicit sheet-reference rates, not current GoogleFinance or verified historical settlement rates. Display-only rate overrides apply to the current screen and matching CSV; they are not persisted and do not alter financial records. All THB costs use exact decimal half-up rounding; margin = (sale − rounded cost) / sale × 100. Missing inputs make dependent totals unavailable rather than a misleading partial sum.

CSV has UTF-8 BOM, Thai-time dates, all filtered rows (not only the visible page), and formula-injection escaping. Default page size 100, maximum period 93 days, maximum physical purchase rows 20,000.

## Checks

`node --import ./tests/register.mjs tests/netease-inventory-tests.mjs`

`node --import ./tests/register.mjs scripts/netease-inventory-smoke.mjs` (after build, Chrome installed).

Live diagnostics performed with SELECT-only access; no actual order, wallet or receipt was modified.
