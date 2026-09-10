-- Wipes stored pack history so the corrected fetchers rebuild it from scratch.
-- Run once against the `gameinfo` database.
--
-- KEPT: love-deepspace-infold and infinity-nikki-infold (their catalogs come from a
-- logged-in Infold session and were never affected by the Xsolla scope bugs), plus
-- demo-data, which is the read-only sample the UI renders, not a game. The schema
-- initializer re-seeds demo rows anyway, so deleting them achieves nothing.
--
-- CLEARED: every other source. This supersedes the narrower Oxide phantom-pack
-- cleanup — those eight entries go with the rest of Oxide's history.
--
-- Only items and events are removed. `runs` and `run_sources` stay: they record when
-- a check ran, which is still true. Their per-source counters are recomputed below so
-- they agree with the events that remain. `run_sources.item_count` is left alone; it
-- records how many items a past run saw and cannot be derived from events.
--
-- After this, the next successful run reports every pack it finds as `added`. That is
-- expected for a rebuild, not a change in the stores.

BEGIN;

-- Preview. ROLLBACK instead of COMMIT if this is not the set you meant.
SELECT s.source_key,
       s.expected_game_name,
       s.enabled,
       COUNT(DISTINCT i.sku) AS items_to_delete,
       (SELECT COUNT(*) FROM gameinfo_russia_check_events e WHERE e.source_id = s.id) AS events_to_delete
  FROM gameinfo_russia_check_sources s
  LEFT JOIN gameinfo_russia_check_items i ON i.source_id = s.id
 WHERE s.source_key NOT IN ('love-deepspace-infold', 'infinity-nikki-infold', 'demo-data')
 GROUP BY s.id, s.source_key, s.expected_game_name, s.enabled
 ORDER BY s.source_key;

-- What survives, for contrast.
SELECT s.source_key, COUNT(DISTINCT i.sku) AS items_kept
  FROM gameinfo_russia_check_sources s
  LEFT JOIN gameinfo_russia_check_items i ON i.source_id = s.id
 WHERE s.source_key IN ('love-deepspace-infold', 'infinity-nikki-infold', 'demo-data')
 GROUP BY s.source_key ORDER BY s.source_key;

DELETE FROM gameinfo_russia_check_events e
 USING gameinfo_russia_check_sources s
 WHERE e.source_id = s.id
   AND s.source_key NOT IN ('love-deepspace-infold', 'infinity-nikki-infold', 'demo-data');

DELETE FROM gameinfo_russia_check_items i
 USING gameinfo_russia_check_sources s
 WHERE i.source_id = s.id
   AND s.source_key NOT IN ('love-deepspace-infold', 'infinity-nikki-infold', 'demo-data');

-- Scalar subqueries, not a grouped join: a run whose last event just went away still
-- needs its counter zeroed, and a grouped join would skip exactly those rows.
UPDATE gameinfo_russia_check_run_sources rs
   SET added_count    = (SELECT COUNT(*) FROM gameinfo_russia_check_events e
                          WHERE e.run_id = rs.run_id AND e.source_id = rs.source_id AND e.event_type = 'added'),
       removed_count  = (SELECT COUNT(*) FROM gameinfo_russia_check_events e
                          WHERE e.run_id = rs.run_id AND e.source_id = rs.source_id AND e.event_type = 'removed'),
       restored_count = (SELECT COUNT(*) FROM gameinfo_russia_check_events e
                          WHERE e.run_id = rs.run_id AND e.source_id = rs.source_id AND e.event_type = 'restored'),
       pending_count  = 0
 WHERE rs.source_id IN (SELECT id FROM gameinfo_russia_check_sources
                         WHERE source_key NOT IN ('love-deepspace-infold', 'infinity-nikki-infold', 'demo-data'));

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

-- Verify: cleared sources hold nothing, kept sources are untouched.
SELECT s.source_key,
       (SELECT COUNT(*) FROM gameinfo_russia_check_items i WHERE i.source_id = s.id)  AS items,
       (SELECT COUNT(*) FROM gameinfo_russia_check_events e WHERE e.source_id = s.id) AS events
  FROM gameinfo_russia_check_sources s ORDER BY s.source_key;
