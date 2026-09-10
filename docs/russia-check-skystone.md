# CRYSTAL OF ATLAN — Skystone Web Shop (EU/NA)

- GameInfo Game ID `122`: `CRYSTAL OF ATLAN ( EU/NA)`.
- Source `crystal-of-atlan-skystone-us`, provider `skystone`, app (`aid`) `754024`, country `US`, locale `en`.
- Store: https://topup.games.skystone.games/Topup/754024
- Anonymous POST: https://topup.games.skystone.games/web/payment/app/754024/country/US/all_goods_detail
- Verified 2026-09-10 with no Cookie or Authorization header: 21 packs matched the logged-out shop (Opal and Voucher ladders plus the two Phantasium Passes).

The `aid` is the number in the store path; the `_xm` query parameter on the shared link is marketing tracking and is not sent. `US` is the EU/NA catalog — `DE`, `GB`, `CA` and `BR` return the same product IDs with local prices, while `RU`, `TH` and `SG` answer `-30303 goods not found`, so the source is pinned to one country and prices are ignored.

## Contract

The storefront posts `{country, role_id: "", pay_channel: "xsolla_paystation", aid}`; without `pay_channel` the shop answers `-30303`. `data.normal` holds the standing packs and `data.activity` the limited-time ones — both count. `product_id` is the SKU and `product_name` the store-localized display name. `data.classify_products` only regroups the same packs for the tab strip and is ignored, so a new tab needs no configuration. Prices, currencies, images, milestone points and lucky-draw fields are out of scope.

A pack with an empty `channels` array cannot be bought and is left out, the same way an unavailable Codashop card is. A SKU repeated between `activity` and `normal` is collapsed when both copies agree and fails the run when they disagree. Reject `code <> 0`, a non-array `normal`/`activity`, malformed records, an empty catalog and responses over 4 MB. Retry transient transport, 429 and 5xx errors up to 3 attempts. These are observed storefront fields, not a versioned public API; shape changes fail the run and preserve previous packs.

The existing daily 09:00 Asia/Bangkok scheduler, manual refresh, permission checks, global single-flight, first-load added events and two-successful-run removal confirmation apply unchanged. No login storage or extension is used. The runtime schema initializer and SQL bootstrap both seed the source; existing processes must load the new code.

## Verification

- Offline fixtures: `node --import ./tests/register.mjs tests/gameinfo-skystone-tests.mjs`
- Run integration: `node --import ./tests/register.mjs tests/gameinfo-skystone-run-tests.mjs`
- Manual anonymous smoke (no DB writes): `node scripts/smoke-skystone.mjs`

Fixture JSON retains only parser-relevant public product fields; it excludes prices, currencies, images and marketing payloads.
