-- GameInfo market mapping, cached offers, checks, and price alerts.

CREATE TABLE IF NOT EXISTS g2g_games (
  value text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO g2g_games (value, slug, label, sort_order)
VALUES ('zepeto-top-up', 'zepeto-top-up', 'ZEPETO', 0)
ON CONFLICT DO NOTHING;
-- Re-runnable by design; runtime keeps the same schema guard for existing installs.

CREATE TABLE IF NOT EXISTS gameinfo_game_markets (
  game_id integer NOT NULL,
  data_mode varchar(16) NOT NULL CHECK (data_mode IN ('uid', 'idpass')),
  market varchar(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
  external_game_key text NOT NULL DEFAULT '',
  external_game_label text NOT NULL DEFAULT '',
  product_type text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  updated_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, data_mode, market)
);
CREATE INDEX IF NOT EXISTS gameinfo_game_markets_enabled_idx ON gameinfo_game_markets (market, enabled, game_id);

CREATE TABLE IF NOT EXISTS gameinfo_market_catalog_packs (
  market varchar(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
  external_game_key text NOT NULL,
  external_pack_key text NOT NULL,
  identity_signature text NOT NULL,
  listing_id text NOT NULL DEFAULT '',
  name text NOT NULL,
  normalized_name text NOT NULL,
  category text NOT NULL DEFAULT '',
  amount text NOT NULL DEFAULT '',
  product_type text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market, external_game_key, external_pack_key)
);
CREATE INDEX IF NOT EXISTS gameinfo_market_catalog_search_idx ON gameinfo_market_catalog_packs (market, external_game_key, active, sort_order);

CREATE TABLE IF NOT EXISTS gameinfo_market_offers (
  market varchar(16) NOT NULL,
  external_game_key text NOT NULL,
  external_pack_key text NOT NULL,
  seller_key text NOT NULL,
  seller_name text NOT NULL,
  listing_id text NOT NULL DEFAULT '',
  price numeric(20,6) NOT NULL,
  currency varchar(12) NOT NULL DEFAULT '',
  product_url text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market, external_game_key, external_pack_key, seller_key)
);
CREATE INDEX IF NOT EXISTS gameinfo_market_offers_seller_idx ON gameinfo_market_offers (market, external_game_key, seller_key);

CREATE TABLE IF NOT EXISTS gameinfo_market_mappings (
  game_id integer NOT NULL,
  data_mode varchar(16) NOT NULL CHECK (data_mode IN ('uid', 'idpass')),
  market varchar(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
  pack_id text NOT NULL,
  gameinfo_pack_name text NOT NULL DEFAULT '',
  external_game_key text NOT NULL,
  external_pack_key text NOT NULL,
  identity_signature text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale')),
  version bigint NOT NULL DEFAULT 1,
  updated_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, data_mode, market, pack_id),
  UNIQUE (game_id, data_mode, market, external_game_key, external_pack_key)
);
CREATE INDEX IF NOT EXISTS gameinfo_market_mappings_external_idx ON gameinfo_market_mappings (market, external_game_key, external_pack_key);

CREATE TABLE IF NOT EXISTS gameinfo_market_mapping_logs (
  id bigserial PRIMARY KEY,
  game_id integer NOT NULL,
  data_mode varchar(16) NOT NULL,
  market varchar(16) NOT NULL,
  pack_id text NOT NULL,
  actor_id integer,
  action varchar(16) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gameinfo_market_own_sellers (
  market varchar(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
  seller_key text NOT NULL,
  seller_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market, seller_key)
);
ALTER TABLE gameinfo_market_own_sellers
  DROP CONSTRAINT IF EXISTS gameinfo_market_own_sellers_market_check;
ALTER TABLE gameinfo_market_own_sellers
  ADD CONSTRAINT gameinfo_market_own_sellers_market_check
  CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g'));

CREATE TABLE IF NOT EXISTS gameinfo_market_rate_references (
  market varchar(16) NOT NULL,
  external_game_key text NOT NULL,
  external_game_label text NOT NULL DEFAULT '',
  reference_at timestamptz NOT NULL,
  updated_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market, external_game_key)
);

-- Snapshot of the "เทียบร้านอื่น" page per market/game/หมวดหมู่, so a page load
-- renders from the database instead of waiting on the market. Refreshed daily at
-- 09:00 Thai time and by the refresh button.
CREATE TABLE IF NOT EXISTS gameinfo_price_pages (
  market varchar(16) NOT NULL,
  game text NOT NULL,
  product_type text NOT NULL DEFAULT '',
  page jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market, game, product_type)
);

CREATE TABLE IF NOT EXISTS gameinfo_market_check_runs (
  id bigserial PRIMARY KEY,
  market varchar(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
  trigger_type varchar(16) NOT NULL CHECK (trigger_type IN ('manual', 'scheduled')),
  status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
  requested_by integer,
  total_games integer NOT NULL DEFAULT 0,
  completed_games integer NOT NULL DEFAULT 0,
  failed_games integer NOT NULL DEFAULT 0,
  alerts_opened integer NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS gameinfo_market_check_single_flight_idx ON gameinfo_market_check_runs (market) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS gameinfo_market_check_run_games (
  run_id bigint NOT NULL,
  game_id integer NOT NULL,
  data_mode varchar(16) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  mapped_count integer NOT NULL DEFAULT 0,
  alert_count integer NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (run_id, game_id, data_mode)
);

CREATE TABLE IF NOT EXISTS gameinfo_price_alerts (
  id bigserial PRIMARY KEY,
  market varchar(16) NOT NULL,
  game_id integer NOT NULL,
  data_mode varchar(16) NOT NULL,
  pack_id text NOT NULL,
  seller_key text NOT NULL,
  seller_name text NOT NULL,
  kind varchar(24) NOT NULL,
  direction varchar(24) NOT NULL,
  base_price numeric(20,6),
  market_price numeric(20,6),
  difference numeric(20,6),
  percent numeric(12,6),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  first_seen_run_id bigint,
  last_seen_run_id bigint,
  resolved_run_id bigint,
  acknowledged_by integer,
  acknowledged_at timestamptz,
  note text NOT NULL DEFAULT '',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (market, game_id, data_mode, pack_id, seller_key)
);
CREATE INDEX IF NOT EXISTS gameinfo_price_alerts_status_idx ON gameinfo_price_alerts (status, market, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS gameinfo_price_alert_events (
  id bigserial PRIMARY KEY,
  alert_id bigint NOT NULL,
  run_id bigint,
  event_type varchar(16) NOT NULL CHECK (event_type IN ('opened', 'seen', 'resolved', 'acknowledged')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gameinfo_price_alert_events_alert_idx ON gameinfo_price_alert_events (alert_id, created_at DESC);
