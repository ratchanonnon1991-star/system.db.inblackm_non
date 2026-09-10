-- Russia Check keeps an independent, append-only history of pack availability.
CREATE TABLE IF NOT EXISTS gameinfo_russia_check_sources (
  id bigserial PRIMARY KEY,
  source_key varchar(64) NOT NULL UNIQUE,
  game_id integer NOT NULL,
  expected_game_name text NOT NULL,
  provider varchar(32) NOT NULL,
  source_url text NOT NULL,
  store_url text,
  project_id varchar(64) NOT NULL,
  country char(2) NOT NULL DEFAULT 'RU',
  locale varchar(8) NOT NULL DEFAULT 'en',
  auth_required boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gameinfo_russia_check_sources ADD COLUMN IF NOT EXISTS store_url text;
ALTER TABLE gameinfo_russia_check_sources ADD COLUMN IF NOT EXISTS auth_required boolean NOT NULL DEFAULT false;
ALTER TABLE gameinfo_russia_check_sources ADD COLUMN IF NOT EXISTS catalog_scope_hash varchar(64);
ALTER TABLE gameinfo_russia_check_sources ADD COLUMN IF NOT EXISTS catalog_types varchar(64) NOT NULL DEFAULT 'virtual_items';

CREATE TABLE IF NOT EXISTS gameinfo_russia_check_source_credentials (
  source_id bigint PRIMARY KEY REFERENCES gameinfo_russia_check_sources(id) ON DELETE CASCADE,
  session_enc text NOT NULL,
  expires_at timestamptz,
  updated_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gameinfo_russia_check_source_credentials ADD COLUMN IF NOT EXISTS credential_kind varchar(16) NOT NULL DEFAULT 'cookie';
ALTER TABLE gameinfo_russia_check_source_credentials ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE gameinfo_russia_check_source_credentials ADD COLUMN IF NOT EXISTS invalidated_at timestamptz;

CREATE TABLE IF NOT EXISTS gameinfo_russia_check_runs (
  id bigserial PRIMARY KEY,
  target_game_id integer,
  trigger_type varchar(16) NOT NULL CHECK (trigger_type IN ('manual', 'scheduled')),
  status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
  requested_by integer,
  total_sources integer NOT NULL DEFAULT 0,
  completed_sources integer NOT NULL DEFAULT 0,
  failed_sources integer NOT NULL DEFAULT 0,
  added_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  restored_count integer NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS gameinfo_russia_check_single_flight_idx
  ON gameinfo_russia_check_runs ((1)) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS gameinfo_russia_check_run_sources (
  run_id bigint NOT NULL REFERENCES gameinfo_russia_check_runs(id) ON DELETE CASCADE,
  source_id bigint NOT NULL REFERENCES gameinfo_russia_check_sources(id),
  status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  item_count integer NOT NULL DEFAULT 0,
  added_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  restored_count integer NOT NULL DEFAULT 0,
  catalog_hash varchar(64) NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY (run_id, source_id)
);

CREATE TABLE IF NOT EXISTS gameinfo_russia_check_items (
  source_id bigint NOT NULL REFERENCES gameinfo_russia_check_sources(id),
  sku text NOT NULL,
  name text NOT NULL,
  status varchar(24) NOT NULL CHECK (status IN ('active', 'pending_removal', 'removed')),
  missing_runs integer NOT NULL DEFAULT 0,
  is_baseline boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  removed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, sku)
);
CREATE INDEX IF NOT EXISTS gameinfo_russia_check_items_status_idx
  ON gameinfo_russia_check_items (source_id, status, name);

CREATE TABLE IF NOT EXISTS gameinfo_russia_check_events (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES gameinfo_russia_check_runs(id),
  source_id bigint NOT NULL REFERENCES gameinfo_russia_check_sources(id),
  sku text NOT NULL,
  pack_name text NOT NULL,
  event_type varchar(16) NOT NULL CHECK (event_type IN ('added', 'removed', 'restored')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gameinfo_russia_check_events_time_idx
  ON gameinfo_russia_check_events (created_at DESC, id DESC);

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale)
VALUES
  ('sky-xsolla-ru', 139, 'SKY CHILDREN', 'xsolla', 'https://store.xsolla.com/api/v2', 'https://store.thatskygame.com/', '207830', 'RU', 'en')
ON CONFLICT (source_key) DO UPDATE SET
  game_id = EXCLUDED.game_id,
  expected_game_name = EXCLUDED.expected_game_name,
  provider = EXCLUDED.provider,
  source_url = EXCLUDED.source_url,
  store_url = EXCLUDED.store_url,
  project_id = EXCLUDED.project_id,
  country = EXCLUDED.country,
  locale = EXCLUDED.locale,
  updated_at = now();

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale, auth_required, enabled)
VALUES
  ('oxide-xsolla-ru', 89, 'OXIDE : SURVIVAL ISLAND', 'xsolla', 'https://store.xsolla.com/api/v2', 'https://shop.playoxide.com/', '274717', 'RU', 'en', false, true)
ON CONFLICT (source_key) DO UPDATE SET
  game_id=EXCLUDED.game_id, expected_game_name=EXCLUDED.expected_game_name, provider=EXCLUDED.provider,
  source_url=EXCLUDED.source_url, store_url=EXCLUDED.store_url, project_id=EXCLUDED.project_id,
  country=EXCLUDED.country, locale=EXCLUDED.locale, auth_required=false, enabled=true, updated_at=now();

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale, auth_required, enabled)
VALUES
  ('bullet-echo-xsolla-ru', 72, 'BULLET ECHO', 'xsolla', 'https://store.xsolla.com/api/v2', 'https://shop.bulletecho.game/', '190666', 'RU', 'en', false, true)
ON CONFLICT (source_key) DO UPDATE SET
  game_id=EXCLUDED.game_id, expected_game_name=EXCLUDED.expected_game_name, provider=EXCLUDED.provider,
  source_url=EXCLUDED.source_url, store_url=EXCLUDED.store_url, project_id=EXCLUDED.project_id,
  country=EXCLUDED.country, locale=EXCLUDED.locale, auth_required=false, enabled=true, updated_at=now();

-- shop.bulletecho.game renders items/bundle/group as well as items/virtual_items/group;
-- 26 of its 43 packs are bundles. Sky Children and Oxide render virtual_items alone.
UPDATE gameinfo_russia_check_sources SET catalog_types='virtual_items,bundle', updated_at=now()
WHERE source_key='bullet-echo-xsolla-ru' AND catalog_types<>'virtual_items,bundle';

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale, auth_required, enabled)
VALUES
  ('love-deepspace-infold', 3, 'LOVE AND DEEPSPACE', 'infold', 'https://loveanddeepspace.infoldgames.com/charge/en-EN', 'https://loveanddeepspace.infoldgames.com/charge/en-EN', 'love-and-deepspace', 'RU', 'en-EN', true, false)
ON CONFLICT (source_key) DO UPDATE SET
  game_id = EXCLUDED.game_id,
  expected_game_name = EXCLUDED.expected_game_name,
  provider = EXCLUDED.provider,
  source_url = EXCLUDED.source_url,
  store_url = EXCLUDED.store_url,
  project_id = EXCLUDED.project_id,
  country = EXCLUDED.country,
  locale = EXCLUDED.locale,
  auth_required = true,
  updated_at = now();

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale, auth_required, enabled)
VALUES
  ('infinity-nikki-infold', 218, 'Infinity Nikki', 'infold', 'https://infinitynikki.infoldgames.com/charge/th-th', 'https://infinitynikki.infoldgames.com/charge/th-th', 'infinity-nikki', 'TH', 'th-th', true, false)
ON CONFLICT (source_key) DO UPDATE SET
  game_id = EXCLUDED.game_id,
  expected_game_name = EXCLUDED.expected_game_name,
  provider = EXCLUDED.provider,
  source_url = EXCLUDED.source_url,
  store_url = EXCLUDED.store_url,
  project_id = EXCLUDED.project_id,
  country = EXCLUDED.country,
  locale = EXCLUDED.locale,
  auth_required = true,
  updated_at = now();

UPDATE gameinfo_russia_check_sources SET enabled=false, updated_at=now()
WHERE source_key='nikke-midasbuy-th';

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale, auth_required, enabled)
VALUES
  ('endfield-gryphline', 217, 'ARKNIGHTS: ENDFIELD', 'gryphline', 'https://as.gryphline.com/user/pay/v3/query_web_product', 'https://topup.gryphline.com/endfield', 'd9f6dbb6bbd6bb33', 'ZZ', 'en-us', true, false)
ON CONFLICT (source_key) DO UPDATE SET
  game_id=EXCLUDED.game_id, expected_game_name=EXCLUDED.expected_game_name, provider=EXCLUDED.provider,
  source_url=EXCLUDED.source_url, store_url=EXCLUDED.store_url, project_id=EXCLUDED.project_id,
  country=EXCLUDED.country, locale=EXCLUDED.locale, auth_required=true, updated_at=now();

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale, auth_required, enabled)
VALUES
  ('stumble-guys-codashop-ph', 21, 'STUMBLE GUYS', 'codashop', 'https://www.codashop.com/en-ph/stumble-guys', 'https://www.codashop.com/en-ph/stumble-guys', 'stumble-guys', 'PH', 'en-ph', false, true),
  ('shining-nikki-codashop-mm', 6, 'SHINING NIKKI', 'codashop', 'https://www.codashop.com/my-mm/shining-nikki', 'https://www.codashop.com/my-mm/shining-nikki', 'shining-nikki', 'MM', 'my-mm', false, true)
ON CONFLICT (source_key) DO UPDATE SET
  game_id=EXCLUDED.game_id, expected_game_name=EXCLUDED.expected_game_name, provider=EXCLUDED.provider,
  source_url=EXCLUDED.source_url, store_url=EXCLUDED.store_url, project_id=EXCLUDED.project_id,
  country=EXCLUDED.country, locale=EXCLUDED.locale, auth_required=false, enabled=true, updated_at=now();

-- Crystal of Atlan sells through the Skystone web shop; the EU/NA catalog answers on country US.
INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale, auth_required, enabled)
VALUES
  ('crystal-of-atlan-skystone-us', 122, 'CRYSTAL OF ATLAN ( EU/NA)', 'skystone', 'https://topup.games.skystone.games', 'https://topup.games.skystone.games/Topup/754024', '754024', 'US', 'en', false, true)
ON CONFLICT (source_key) DO UPDATE SET
  game_id=EXCLUDED.game_id, expected_game_name=EXCLUDED.expected_game_name, provider=EXCLUDED.provider,
  source_url=EXCLUDED.source_url, store_url=EXCLUDED.store_url, project_id=EXCLUDED.project_id,
  country=EXCLUDED.country, locale=EXCLUDED.locale, auth_required=false, enabled=true, updated_at=now();

INSERT INTO gameinfo_russia_check_sources
  (source_key, game_id, expected_game_name, provider, source_url, project_id, country, locale, enabled)
VALUES
  ('demo-data', 2147483647, 'demo data', 'demo', 'internal://demo', 'demo', 'RU', 'en', false)
ON CONFLICT (source_key) DO UPDATE SET
  expected_game_name = EXCLUDED.expected_game_name,
  provider = EXCLUDED.provider,
  enabled = false,
  updated_at = now();

DO $$
DECLARE
  demo_source_id bigint;
  demo_run_id bigint;
  demo_time timestamptz := now() - interval '1 day';
BEGIN
  SELECT id INTO demo_source_id FROM gameinfo_russia_check_sources WHERE source_key='demo-data';
  SELECT rs.run_id INTO demo_run_id
    FROM gameinfo_russia_check_run_sources rs
    WHERE rs.source_id=demo_source_id
    ORDER BY rs.run_id LIMIT 1;

  IF demo_run_id IS NULL THEN
    INSERT INTO gameinfo_russia_check_runs
      (target_game_id, trigger_type, status, total_sources, completed_sources, added_count, removed_count, restored_count, created_at, started_at, finished_at)
    VALUES
      (2147483647, 'manual', 'completed', 1, 1, 1, 1, 1, demo_time, demo_time, demo_time + interval '1 minute')
    RETURNING id INTO demo_run_id;

    INSERT INTO gameinfo_russia_check_run_sources
      (run_id, source_id, status, item_count, added_count, removed_count, restored_count, started_at, finished_at)
    VALUES
      (demo_run_id, demo_source_id, 'completed', 20, 6, 4, 3, demo_time, demo_time + interval '1 minute');
  END IF;

  INSERT INTO gameinfo_russia_check_items
    (source_id, sku, name, status, missing_runs, is_baseline, first_seen_at, last_seen_at, activated_at, removed_at)
  VALUES
    (demo_source_id, 'demo-unchanged', 'Demo — Existing Pack', 'active', 0, true, demo_time - interval '30 days', demo_time, null, null),
    (demo_source_id, 'demo-daily-candle', 'Demo — Daily Candle Bundle', 'active', 0, true, demo_time - interval '29 days', demo_time, null, null),
    (demo_source_id, 'demo-starter-cape', 'Demo — Starter Cape Set', 'active', 0, true, demo_time - interval '28 days', demo_time, null, null),
    (demo_source_id, 'demo-friendship-gift', 'Demo — Friendship Gift', 'active', 0, true, demo_time - interval '27 days', demo_time, null, null),
    (demo_source_id, 'demo-traveler-bundle', 'Demo — Traveler Bundle', 'active', 0, true, demo_time - interval '26 days', demo_time, null, null),
    (demo_source_id, 'demo-seasonal-token', 'Demo — Seasonal Token Pack', 'active', 0, true, demo_time - interval '25 days', demo_time, null, null),
    (demo_source_id, 'demo-welcome-cosmetic', 'Demo — Welcome Cosmetic Set', 'active', 0, true, demo_time - interval '24 days', demo_time, null, null),
    (demo_source_id, 'demo-added', 'Demo — New Pack', 'active', 0, false, demo_time, demo_time, demo_time + interval '10 seconds', null),
    (demo_source_id, 'demo-aurora-wings', 'Demo — Aurora Wings Pack', 'active', 0, false, demo_time, demo_time, demo_time + interval '11 seconds', null),
    (demo_source_id, 'demo-moonlight-cape', 'Demo — Moonlight Cape Pack', 'active', 0, false, demo_time, demo_time, demo_time + interval '12 seconds', null),
    (demo_source_id, 'demo-starlight-accessory', 'Demo — Starlight Accessory Pack', 'active', 0, false, demo_time, demo_time, demo_time + interval '13 seconds', null),
    (demo_source_id, 'demo-festival-mask', 'Demo — Festival Mask Pack', 'active', 0, false, demo_time, demo_time, demo_time + interval '14 seconds', null),
    (demo_source_id, 'demo-cloud-companion', 'Demo — Cloud Companion Pack', 'active', 0, false, demo_time, demo_time, demo_time + interval '15 seconds', null),
    (demo_source_id, 'demo-pending', 'Demo — Pending Confirmation', 'pending_removal', 1, true, demo_time - interval '20 days', demo_time - interval '1 day', null, null),
    (demo_source_id, 'demo-sunset-outfit', 'Demo — Sunset Outfit Pack', 'pending_removal', 1, true, demo_time - interval '19 days', demo_time - interval '1 day', null, null),
    (demo_source_id, 'demo-forest-music', 'Demo — Forest Music Pack', 'pending_removal', 1, true, demo_time - interval '18 days', demo_time - interval '1 day', null, null),
    (demo_source_id, 'demo-removed', 'Demo — Removed Pack', 'removed', 2, false, demo_time - interval '15 days', demo_time - interval '2 days', demo_time - interval '15 days', demo_time + interval '20 seconds'),
    (demo_source_id, 'demo-winter-feast', 'Demo — Winter Feast Pack', 'removed', 2, false, demo_time - interval '14 days', demo_time - interval '2 days', demo_time - interval '14 days', demo_time + interval '21 seconds'),
    (demo_source_id, 'demo-ocean-call', 'Demo — Ocean Call Pack', 'removed', 2, false, demo_time - interval '13 days', demo_time - interval '2 days', demo_time - interval '13 days', demo_time + interval '22 seconds'),
    (demo_source_id, 'demo-lantern-celebration', 'Demo — Lantern Celebration Pack', 'removed', 2, false, demo_time - interval '12 days', demo_time - interval '2 days', demo_time - interval '12 days', demo_time + interval '23 seconds')
  ON CONFLICT (source_id, sku) DO NOTHING;

  INSERT INTO gameinfo_russia_check_events (run_id, source_id, sku, pack_name, event_type, created_at)
  SELECT demo_run_id, demo_source_id, fixture.sku, fixture.pack_name, fixture.event_type, fixture.created_at
  FROM (VALUES
    ('demo-added', 'Demo — New Pack', 'added', demo_time + interval '10 seconds'),
    ('demo-aurora-wings', 'Demo — Aurora Wings Pack', 'added', demo_time + interval '11 seconds'),
    ('demo-moonlight-cape', 'Demo — Moonlight Cape Pack', 'added', demo_time + interval '12 seconds'),
    ('demo-starlight-accessory', 'Demo — Starlight Accessory Pack', 'added', demo_time + interval '13 seconds'),
    ('demo-festival-mask', 'Demo — Festival Mask Pack', 'added', demo_time + interval '14 seconds'),
    ('demo-cloud-companion', 'Demo — Cloud Companion Pack', 'added', demo_time + interval '15 seconds'),
    ('demo-removed', 'Demo — Removed Pack', 'removed', demo_time + interval '20 seconds'),
    ('demo-winter-feast', 'Demo — Winter Feast Pack', 'removed', demo_time + interval '21 seconds'),
    ('demo-ocean-call', 'Demo — Ocean Call Pack', 'removed', demo_time + interval '22 seconds'),
    ('demo-lantern-celebration', 'Demo — Lantern Celebration Pack', 'removed', demo_time + interval '23 seconds'),
    ('demo-restored-log', 'Demo — Returned Pack', 'restored', demo_time + interval '30 seconds'),
    ('demo-friendship-gift', 'Demo — Friendship Gift', 'restored', demo_time + interval '31 seconds'),
    ('demo-traveler-bundle', 'Demo — Traveler Bundle', 'restored', demo_time + interval '32 seconds')
  ) AS fixture(sku, pack_name, event_type, created_at)
  WHERE NOT EXISTS (
    SELECT 1 FROM gameinfo_russia_check_events e
    WHERE e.source_id=demo_source_id AND e.sku=fixture.sku AND e.event_type=fixture.event_type
  );
  UPDATE gameinfo_russia_check_run_sources
  SET item_count=20,added_count=6,removed_count=4,restored_count=3
  WHERE run_id=demo_run_id AND source_id=demo_source_id;
END $$;

-- Older silent baselines are converted once so the first catalog is visible in the log.
INSERT INTO gameinfo_russia_check_events (run_id, source_id, sku, pack_name, event_type, created_at)
SELECT first_run.run_id, i.source_id, i.sku, i.name, 'added', i.first_seen_at
FROM gameinfo_russia_check_items i
JOIN gameinfo_russia_check_sources s ON s.id=i.source_id
JOIN LATERAL (
  SELECT rs.run_id
  FROM gameinfo_russia_check_run_sources rs
  WHERE rs.source_id=i.source_id AND rs.status='completed'
  ORDER BY rs.run_id
  LIMIT 1
) first_run ON true
WHERE i.is_baseline AND s.provider<>'demo'
  AND NOT EXISTS (
    SELECT 1 FROM gameinfo_russia_check_events e
    WHERE e.source_id=i.source_id AND e.sku=i.sku AND e.event_type='added'
  );

UPDATE gameinfo_russia_check_items i
SET activated_at=i.first_seen_at, updated_at=now()
FROM gameinfo_russia_check_sources s
WHERE s.id=i.source_id AND s.provider<>'demo' AND i.is_baseline AND i.activated_at IS NULL;

UPDATE gameinfo_russia_check_run_sources rs
SET added_count=events.added_count
FROM (
  SELECT run_id, source_id, COUNT(*) FILTER (WHERE event_type='added')::int AS added_count
  FROM gameinfo_russia_check_events
  GROUP BY run_id, source_id
) events
WHERE events.run_id=rs.run_id AND events.source_id=rs.source_id;

UPDATE gameinfo_russia_check_runs r
SET added_count=totals.added_count
FROM (
  SELECT run_id, COALESCE(SUM(added_count),0)::int AS added_count
  FROM gameinfo_russia_check_run_sources
  GROUP BY run_id
) totals
WHERE totals.run_id=r.id;
