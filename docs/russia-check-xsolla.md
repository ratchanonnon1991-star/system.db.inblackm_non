# Xsolla storefronts — which packs count

Three sources use the Xsolla Store API: `sky-xsolla-ru` (project 207830), `bullet-echo-xsolla-ru` (190666) and `oxide-xsolla-ru` (274717). All three are anonymous — no cookie, no login.

Counts verified 2026-09-10 by rendering each shop in a browser and counting the cards it draws:

| source | store | packs |
| --- | --- | --- |
| SKY CHILDREN | store.thatskygame.com | 22 |
| BULLET ECHO | shop.bulletecho.game | 41 |
| OXIDE | shop.playoxide.com | 14 |

## Contract

Read both `items/virtual_items` and `items/bundle`, paging on `limit`/`offset`/`has_more`. Neither path alone is right: 24 of Bullet Echo's 41 packs are bundles, while Sky and Oxide sell almost nothing as one.

Two rules then decide what a shopper can actually reach. Nothing in the Store API marks the rest as hidden — the filtering lives in the site-builder page layout — so these are modelled from what the shops render:

1. **An item outside every group has no block to appear in.** This drops Bullet Echo's `welcome-offer-test` and Oxide's `100.bonus.coins.discord`.
2. **A group renders one catalog type.** Where a group holds virtual items, the bundles carrying the same group id stay hidden. That is how Bullet Echo's BUCKS PACKS row shows `bucks1..6` and not the leftover `bucks1_TEST` / `bucks1_bundle` duplicates — all three are named "Handful of Bucks" at $1.99 in group `currency`, and their API records are otherwise indistinguishable. Sky's `sky115` ("Bundle 5", a wrapper around the single existing `xsolla.sky.cdl5` candle pack) stays off the Candles row the same way.

`excluded_groups` handles what is left: whole rows a logged-out shopper never sees. Oxide sets `subscriptions,loyalty_tickets`, hiding 2 memberships and 5 loyalty tickets. It is a denylist, not an allowlist, so a group the merchant adds later shows up as added packs rather than being silently dropped.

Bullet Echo's WELCOME PACK (`xsolla_welcome_pack_offer`) is drawn by a separate federated site-builder module and carries no `data-sku`, so a DOM count reads 40 cards; it is a real, buyable, limited offer and belongs in the 41.

`can_be_bought: false` items are skipped, as everywhere else. Empty or malformed catalogs fail the run and preserve the stored packs.

## Verification

- `node --import ./tests/register.mjs tests/gameinfo-russia-check-tests.mjs`
- Re-checking against a live shop means rendering it: the counts above come from `[data-sku]` elements after scrolling the page, not from the API.
