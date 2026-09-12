# NIKKE — Midasbuy (Thailand)

- GameInfo Game ID `22`: `GODDESS OF VICTORY: NIKKE UID` (validated before each fetch).
- Source `nikke-midasbuy-th`, provider `midasbuy`, app `1460000285`, country `TH`, language `en` (English names, Thai catalog).
- Store: https://www.midasbuy.com/midasbuy/th/shop/nikkegl#/pages/shop/items
- Anonymous POST: https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query
- Verified 2026-09-03 with no Cookie or Authorization header: 9 packs matched the logged-out Items page. English returns the same product IDs with localized names (for example, `Monthly pass` and `Technical Support S I`). This is the Thai public shelf, not Russia and not account-specific offers.

Changing language updates current names on the next successful refresh without added/removed events because product IDs stay the same. Existing immutable logs keep the names recorded at event time.

## Contract

The official storefront requests `product_types: ["Rp", "Subscription"]` with an empty `tab_lab`, no category filter, and empty user identifiers. `shelf.products` contains top-level packs; `product_id` is internal SKU and `name` is the store-localized display name. Ignore prices, payment tokens, recommendations and nested `bundle_items`. New categories within the Items shelf do not require configuration. The separate Gems tab and account-only offers are out of scope.

Follow nonempty `shelf.product_offset` by sending `product_offset` to the same endpoint, as the storefront does. Never reconcile until all pages succeed. Reject duplicate IDs/cursors, empty catalog, wrong app/region, malformed records, maintenance, upstream partial-failure flags and resource limits. Retry transient transport/429/5xx errors up to 3 attempts per page. These are observed storefront fields, not a versioned public API; shape changes fail the run and preserve previous packs.

The existing daily 09:00 Asia/Bangkok scheduler, manual refresh, permission checks, global single-flight, first-load added events and two-successful-run removal confirmation apply unchanged. No login storage or extension is used. The runtime schema initializer and SQL bootstrap both seed the source; existing processes must load the new code.

## Verification

- Offline fixtures: `node --import ./tests/register.mjs tests/gameinfo-midasbuy-tests.mjs`
- Run integration: `node --import ./tests/register.mjs tests/gameinfo-midasbuy-run-tests.mjs`
- Manual anonymous smoke (no DB writes): `node scripts/smoke-midasbuy.mjs`

Fixture JSON retains only parser-relevant public product fields; it excludes upstream payment tokens, prices and cookies.
