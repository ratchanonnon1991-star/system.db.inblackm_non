-- One-off cleanup. Run once against the `gameinfo` database, then keep for the record.
--
-- Clears history for entries the old fetcher recorded that are not packs the Russia
-- Check should be counting. All eight belong to Oxide; Sky Children and Bullet Echo
-- need nothing, because the old fetcher read items/virtual_items only and every
-- virtual item those two sell is still counted. The junk that motivated this
-- (`sky115`, `bucks1_TEST`, `bucks1_bundle`, `welcome-offer-test`) are all bundles,
-- so they were never fetched and never stored.
--
-- Two kinds, deleted together:
--   1. Never a pack at all — `100.bonus.coins.discord` belongs to no storefront group,
--      so shop.playoxide.com has no row that can render it.
--   2. Real catalog items a logged-out shopper never sees — the two memberships in
--      group `subscriptions` and the five tickets in `loyalty_tickets`. The checker
--      runs anonymously, so these are now out of scope by `excluded_groups`.
--
-- Not touched: genuinely delisted packs, and run_sources.item_count (a record of how
-- many items each past run saw, which cannot be recomputed from events).

CREATE TEMP TABLE phantom_pack (source_key text, sku text) ON COMMIT DROP;

BEGIN;

INSERT INTO phantom_pack (source_key, sku) VALUES
  ('oxide-xsolla-ru', '100.bonus.coins.discord'),
  ('oxide-xsolla-ru', 'weekly.reward.membership.otp'),
  ('oxide-xsolla-ru', 'monthly.reward.membership.otp'),
  ('oxide-xsolla-ru', 'loyalty.ticket.5'),
  ('oxide-xsolla-ru', 'loyalty.ticket.10'),
  ('oxide-xsolla-ru', 'loyalty.ticket.25'),
  ('oxide-xsolla-ru', 'loyalty.ticket.50'),
  ('oxide-xsolla-ru', 'loyalty.ticket.100');

-- Preview. Roll back instead of committing if this is not what you expect.
SELECT s.source_key, i.sku, i.name, i.status, i.first_seen_at
  FROM gameinfo_russia_check_items i
  JOIN gameinfo_russia_check_sources s ON s.id = i.source_id
  JOIN phantom_pack p ON p.source_key = s.source_key AND p.sku = i.sku
 ORDER BY i.sku;

DELETE FROM gameinfo_russia_check_events e
 USING gameinfo_russia_check_sources s, phantom_pack p
 WHERE e.source_id = s.id AND p.source_key = s.source_key AND p.sku = e.sku;

DELETE FROM gameinfo_russia_check_items i
 USING gameinfo_russia_check_sources s, phantom_pack p
 WHERE i.source_id = s.id AND p.source_key = s.source_key AND p.sku = i.sku;

-- Scalar subqueries, not a grouped join: a run whose last event just went away still
-- needs its counter zeroed, and a grouped join would skip exactly those rows.
UPDATE gameinfo_russia_check_run_sources rs
   SET added_count    = (SELECT COUNT(*) FROM gameinfo_russia_check_events e
                          WHERE e.run_id = rs.run_id AND e.source_id = rs.source_id AND e.event_type = 'added'),
       removed_count  = (SELECT COUNT(*) FROM gameinfo_russia_check_events e
                          WHERE e.run_id = rs.run_id AND e.source_id = rs.source_id AND e.event_type = 'removed'),
       restored_count = (SELECT COUNT(*) FROM gameinfo_russia_check_events e
                          WHERE e.run_id = rs.run_id AND e.source_id = rs.source_id AND e.event_type = 'restored')
 WHERE rs.source_id IN (SELECT id FROM gameinfo_russia_check_sources s
                         WHERE s.source_key IN (SELECT source_key FROM phantom_pack));

UPDATE gameinfo_russia_check_runs r
   SET added_count    = totals.added,
       removed_count  = totals.removed,
       restored_count = totals.restored,
       pending_count  = totals.pending
  FROM (SELECT run_id,
               COALESCE(SUM(added_count), 0)::int    AS added,
               COALESCE(SUM(removed_count), 0)::int  AS removed,
               COALESCE(SUM(restored_count), 0)::int AS restored,
               COALESCE(SUM(pending_count), 0)::int  AS pending
          FROM gameinfo_russia_check_run_sources GROUP BY run_id) totals
 WHERE totals.run_id = r.id;

COMMIT;

-- Verify: both must return zero.
SELECT COUNT(*) AS items_left FROM gameinfo_russia_check_items i
  JOIN gameinfo_russia_check_sources s ON s.id = i.source_id
 WHERE s.source_key = 'oxide-xsolla-ru'
   AND i.sku IN ('100.bonus.coins.discord','weekly.reward.membership.otp','monthly.reward.membership.otp',
                 'loyalty.ticket.5','loyalty.ticket.10','loyalty.ticket.25','loyalty.ticket.50','loyalty.ticket.100');
SELECT COUNT(*) AS events_left FROM gameinfo_russia_check_events e
  JOIN gameinfo_russia_check_sources s ON s.id = e.source_id
 WHERE s.source_key = 'oxide-xsolla-ru'
   AND e.sku IN ('100.bonus.coins.discord','weekly.reward.membership.otp','monthly.reward.membership.otp',
                 'loyalty.ticket.5','loyalty.ticket.10','loyalty.ticket.25','loyalty.ticket.50','loyalty.ticket.100');
