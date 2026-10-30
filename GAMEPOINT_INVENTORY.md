# Gamepoint MYR Inventory

Route: `/projectm/th/topup-inventory/gamepoint`. Read-only, authenticated with the existing inventory permission. No provider calls, consume replay, wallet writes, schema migration, or workbook import.

The reference workbook's `(MYR) gamepoint` tab uses `I4 * 7.84` for cost and `F4 / D4 * 100` for margin. The default THB/MYR rate is editable for the report only. Opening MYR 34,509.58 and remaining reference MYR 11,236.81 stay separate from bot observations. Credentials in the workbook are never copied into the app.

Completed `codashop_orders` with `payment_method = GamePointClub` are joined to sale evidence using the existing exact-order sale allocation and currency conversion. A selected date range includes complete customer orders that have any completed fill inside that range (including sibling fills outside it). Source + customer order groups are formed before search/pagination/export, while `/1` and `/2` remain distinct purchased units. Missing amounts stay null, including totals and dependent profit.

## Debit evidence

- Prefer a complete, unique set of `provider_response._worker_meta.line_states` amounts with `status = done`, covering the saved plan refs, total and quantity. Root `amount` may represent only the last invoice, so it is used only for a single-pack order with no line evidence.
- A single positive inventory transaction in a typed GamePointClub/MYR lot or a SYSTEM/NONE placeholder can corroborate/recover the debit. A conflict with provider evidence makes usage/cost/profit unavailable with a warning. Multiple ledger rows are not summed as confirmed usage.
- `stored_cost` is catalog/account cost, not necessarily wallet debit. Display it in details only, never use it as CostMYR or infer debit from wallet deltas.
- Cost THB is total MYR debit × selected rate, rounded once per customer order. This is a sheet-rate reference, not historical purchase cost.

## Balance evidence and worker findings (read-only audit, 22 October 2026)

October completed data: 529 MLBB Indonesia, 206 Harry Potter, 71 Crossfire (both names), 5 Be The King and 3 Racing Master. Root `amount` was absent in 18 Crossfire rows. For example queue 299476 has line debit + ledger 200.24 MYR versus stored_cost 195.87. Queue 299401 has line + ledger 31.87 versus stored_cost 31.18. The data is present at a different level, not a zero debit.

Worker source `GamepointTopupWorker/src/orders/jobProcessor.js` sends `new_balance` and `live_pack_price` to the immediate completion/Telegram path but does not persist them through `markOrderSubmitted`. Every inspected October row lacks `_worker_meta.live_cost`, while all have saved `balance_before` and stored_cost. `orderCompleter.js` callback path can finalize without immediate-path Telegram extras. This explains inconsistent display/evidence paths; it does not establish which path completed every historical order.

The new page displays saved pre-submit balance and its submission timestamp independently of report filters. Per-order remaining = saved before − verified debit is explicitly **calculated**, never claimed to be an observed API post-fill balance. Concurrent orders/top-ups can invalidate this estimate. No backfilling an API balance that was never saved. SYSTEM/NONE shared balances are never treated as a Gamepoint wallet. A future worker persistence change needs its own tests/deployment; this task does not modify or deploy that worker.

Test: `node --import ./tests/register.mjs tests/gamepoint-inventory-tests.mjs`.

## PAGE sale key correction

For PAGE only, normalize a matched telegram order's `customer:dispatch:unit` to the same customer key used by the pack-count query before enrichment. A reused transport task may point to the final dispatch of the same customer order, so exact dispatch equality is not required. Different customer keys and ambiguous prices remain unavailable. `/1` and `/2` customer keys are not stripped. Other sources and shared provider reports are unchanged.

Confirmed read-only examples: 218598 = 1,680.00 THB, 218594 = 270.00, 218586 = 249.98. For 217947 the original saved customer price is 2,450.00 shared across two completed dispatches; allocate 1,225.00 per dispatch and show 2,450.00 once, not twice. Regression tests exercise the real sale enricher and allocator, not only mocked normalized rows.

October read-only comparison: same 814 fills, 568 customer orders and MYR debit/cost totals before and after this correction. Missing sales drop from 264 to 131. Remaining non-PAGE missing/ambiguous receipts and unavailable FX conversions are not fabricated or treated as zero by this fix.
