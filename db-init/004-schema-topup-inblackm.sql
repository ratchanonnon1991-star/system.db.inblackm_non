-- Schema: topup_inblackm (34 base tables)
-- Generated from docs/database-erd.md (snapshot 2026-08-22).
-- Saved connections `gameinfo` and `topup_inblackm` both point here.
\connect topup_inblackm

-- ---------------------------------------------------------------------------
-- 3. Game Info
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS game_list (
  id            bigserial PRIMARY KEY,
  rank_stars    smallint NOT NULL DEFAULT 0,
  bot_manual    varchar  NOT NULL,
  channel       varchar  NOT NULL,
  region        varchar  NOT NULL,
  vpn           varchar  NOT NULL,
  game          varchar  NOT NULL,
  is_repeatable boolean  NOT NULL DEFAULT false,
  link          text,
  platform      varchar,
  server        varchar,
  remark        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gameinfo_exchange_rates (
  pair         varchar(16) NOT NULL,
  fetched_hour timestamptz NOT NULL,
  rate         numeric     NOT NULL CHECK (rate > 0),
  provider     varchar(80) NOT NULL,
  fetched_at   timestamptz NOT NULL,
  provider_at  timestamptz,
  expires_at   timestamptz NOT NULL,
  PRIMARY KEY (pair, fetched_hour)
);

CREATE TABLE IF NOT EXISTS gameinfo_mode_data (
  game_id    integer     NOT NULL,           -- LOGICAL -> game_list.id
  data_mode  varchar(16) NOT NULL CHECK (data_mode = 'idpass'),
  data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, data_mode)
);

CREATE TABLE IF NOT EXISTS gameinfo_bot_channels (
  id           bigserial PRIMARY KEY,
  category     varchar(3) NOT NULL CHECK (category IN ('BOT', 'API')),
  channel_name text NOT NULL CHECK (btrim(channel_name) <> ''),
  image_url    text NOT NULL DEFAULT '',
  currencies   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gameinfo_bot_channels
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS gameinfo_bot_category_images (
  category   varchar(3) PRIMARY KEY CHECK (category IN ('BOT', 'API')),
  image_url  text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gameinfo_bot_channels_category_name
  ON gameinfo_bot_channels (category, lower(channel_name));

INSERT INTO gameinfo_bot_channels (category, channel_name, currencies, sort_order)
SELECT seed.category, seed.channel_name, seed.currencies::jsonb, seed.sort_order
FROM (VALUES
  ('API', 'Codashop Reseller', '[{"name":"","games":["Zepeto","MLBB","AFK Journey","PGR","Magic GoGo","RB6","Farlight","Free Fire ID"]}]', 0),
  ('API', 'Ronshop', '[{"name":"","games":["Dragon Nest","Marvel Rivals","PUBG Mobile","SuperSUS","One Punch Man","Hatsune Miku","Speed Drifters","Blood Strike"]}]', 1),
  ('API', 'Acorn 2H', '[{"name":"","games":["ZZZ","Genshin","Watcher of Realms"]}]', 2),
  ('API', 'Game Point', '[{"name":"","games":["MLBB JBR","HoK","Be the King","Racing Master","Crossfire","Eggy Party","LifeAfter SEA"]}]', 3),
  ('API', 'PLS Buy', '[{"name":"","games":["Stella Sora","Azur Lane","Tales of Survive","Gangstar Mirage"]}]', 4),
  ('BOT', 'GoCash', '[{"name":"","games":["Sky","MLA"]}]', 5),
  ('BOT', 'Multi Game Card', '[{"name":"","games":["Oxide","Avakin"]}]', 6),
  ('BOT', 'Razer', '[{"name":"CAD","games":["Avatar: Realms Collide","Infinite Magicraid","Cats: Crash Arena Turbo Stars","Crusader Mobile","Black Post","UNDAWN","Arena Breakout"]},{"name":"SGD","games":["Tokyo Ghoul","Magic Man","Samkok: New Force","Legend of Angel","ROO","Ace of Em","Kuroko Basketball","Mungil: Star Dive","Legend of Mushroom","Drag Racing"]}]', 7),
  ('BOT', 'Codashop', '[{"name":"MMK","games":["Love Deep","Honkai Impact 3","Harry Potter: Magic Awakened","Auto Chess","Path to Nowhere","Shining Nikki","Dummy Land","Heaven Burns Red","8 Ball Pool"]},{"name":"PHP","games":["Top Eleven","Honkai: Star Rail","Stumble Guys"]},{"name":"LAK","games":["Dragon City","Growtopia","Tom and Jerry","Nico"]},{"name":"THB","games":["World War Heroes"]}]', 8),
  ('BOT', 'NetEase', '[{"name":"","games":["Where Winds Meet","Sword of Justice","Identity V","Once Human","Destiny: Rising"]}]', 9)
) AS seed(category, channel_name, currencies, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM gameinfo_bot_channels)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS gamelist_favorites (
  -- user_id is a cross-database LOGICAL link to inblackm_system.gamedb_users
  user_id    text        NOT NULL,
  game_id    integer     NOT NULL,           -- LOGICAL -> game_list.id
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS gameinfo_market_preferences (
  -- user_id is a cross-database LOGICAL link to inblackm_system.gamedb_users
  user_id         text        NOT NULL,
  provider        varchar(16) NOT NULL CHECK (provider IN ('kaleoz', 'itemku')),
  game            varchar(160) NOT NULL,
  baseline_seller text        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider, game)
);

CREATE TABLE IF NOT EXISTS gamelist_formula_variables (
  game_id    integer PRIMARY KEY,            -- LOGICAL -> game_list.id; 0 is global
  data       jsonb       NOT NULL DEFAULT '{"variables": []}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_formula_variable_logs (
  id          bigserial PRIMARY KEY,
  game_id     integer NOT NULL,              -- LOGICAL -> gamelist_formula_variables.game_id
  actor_id    integer,                       -- LOGICAL -> gamedb_users.id (cross-database)
  actor_name  text,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_images (
  game_id    integer PRIMARY KEY,            -- LOGICAL -> game_list.id
  image_url  text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_links (
  game_id    integer PRIMARY KEY,            -- LOGICAL -> game_list.id
  data       jsonb       NOT NULL DEFAULT '{"links": []}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_order (
  game_id    integer PRIMARY KEY,            -- LOGICAL -> game_list.id
  sort_order integer     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_reports (
  id          bigserial PRIMARY KEY,
  game_id     integer NOT NULL,              -- LOGICAL -> game_list.id
  source      text    NOT NULL CHECK (source IN ('topup', 'admin')),
  message     text    NOT NULL,
  status      text    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by  text    NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by text,
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS gamelist_service_status (
  game_id    integer PRIMARY KEY,            -- LOGICAL -> game_list.id
  enabled    boolean     NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_new     boolean     NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS gamelist_tutorials (
  game_id      integer PRIMARY KEY,          -- LOGICAL -> game_list.id
  data         jsonb       NOT NULL DEFAULT '{"steps": []}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  warning_data jsonb       NOT NULL DEFAULT '{"categories": []}'::jsonb,
  vpn_data     jsonb       NOT NULL DEFAULT '{"categories": []}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 4. Packs and catalogs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gamelist_packs (
  game_id    integer NOT NULL,               -- LOGICAL -> game_list.id
  pack_id    text    NOT NULL,
  data       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, pack_id)
);

CREATE TABLE IF NOT EXISTS gamelist_pack_audit_logs (
  id          bigserial PRIMARY KEY,
  game_id     integer      NOT NULL,         -- LOGICAL -> gamelist_packs.game_id
  pack_id     text,                          -- LOGICAL -> gamelist_packs.pack_id
  actor_id    integer,                       -- LOGICAL -> gamedb_users.id (cross-database)
  actor_name  varchar(255) NOT NULL DEFAULT '',
  action      varchar(32)  NOT NULL,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  source      varchar(32)  NOT NULL DEFAULT 'editor',
  area        varchar(32)  NOT NULL,
  data_mode   varchar(16)  NOT NULL
);

CREATE TABLE IF NOT EXISTS gamelist_pack_languages (
  id              bigserial PRIMARY KEY,
  name            varchar(80) NOT NULL,
  normalized_name varchar(80) NOT NULL UNIQUE,
  created_by      integer,                   -- LOGICAL -> gamedb_users.id (cross-database)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gameinfo_formula_presets (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  normalized_name text        NOT NULL UNIQUE CHECK (char_length(normalized_name) BETWEEN 1 AND 80),
  formula         text        NOT NULL CHECK (char_length(formula) BETWEEN 1 AND 500),
  result_type     text        NOT NULL CHECK (result_type IN ('number', 'text', 'date', 'boolean')),
  symbol          text        NOT NULL DEFAULT '' CHECK (char_length(symbol) <= 24),
  created_by      integer,                   -- LOGICAL -> gamedb_users.id (cross-database)
  created_by_name text        NOT NULL DEFAULT '',
  updated_by      integer,                   -- LOGICAL -> gamedb_users.id (cross-database)
  updated_by_name text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gameinfo_formula_presets_updated_idx
  ON gameinfo_formula_presets (updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS gamelist_pack_view_presets (
  id         bigserial PRIMARY KEY,
  game_id    integer     NOT NULL,           -- LOGICAL -> game_list.id
  user_id    integer     NOT NULL,           -- LOGICAL -> gamedb_users.id (cross-database)
  surface    varchar(12) NOT NULL CHECK (surface IN ('edit', 'view')),
  name       varchar(80) NOT NULL,
  layout     jsonb       NOT NULL DEFAULT '{"order": [], "hidden": []}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gamelist_pack_view_presets_game_user_surface_name
  ON gamelist_pack_view_presets (game_id, user_id, surface, name);
DROP INDEX IF EXISTS gamelist_pack_view_presets_game_user_name;
ALTER TABLE gamelist_pack_view_presets
  DROP CONSTRAINT IF EXISTS gamelist_pack_view_presets_game_id_user_id_surface_name_key;

CREATE TABLE IF NOT EXISTS gamelist_publisher_catalog (
  publisher_key text PRIMARY KEY,
  name          text NOT NULL,
  image_url     text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_publishers (
  game_id    integer PRIMARY KEY,            -- LOGICAL -> game_list.id
  data       jsonb   NOT NULL DEFAULT '{"publishers": []}'::jsonb,  -- -> gamelist_publisher_catalog
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_tag_catalog (
  tag_key    text PRIMARY KEY,
  name       text NOT NULL,
  image_url  text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamelist_tags (
  game_id    integer PRIMARY KEY,            -- LOGICAL -> game_list.id
  data       jsonb   NOT NULL DEFAULT '{"tags": []}'::jsonb,  -- tag keys -> gamelist_tag_catalog
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. iTune queue and logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projectm_itune_roles (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projectm_itune_entries (
  id                      serial PRIMARY KEY,
  added_at                timestamptz NOT NULL DEFAULT now(),
  sms_expiry              date        NOT NULL DEFAULT CURRENT_DATE,
  status                  text,
  support                 text,
  email                   text,
  password                text,
  created_by_user_id      integer,           -- LOGICAL -> gamedb_users.id (cross-database)
  currency                text,
  supplier                text,
  amount                  numeric(14,2) NOT NULL DEFAULT 0,
  amount_confirm_image    text,
  amount_out              numeric(14,2) NOT NULL DEFAULT 0,
  link_sms                text,
  qna                     text,
  other_notes             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  claimed_by_user_id      integer,           -- LOGICAL -> gamedb_users.id (cross-database)
  claimed_at              timestamptz,
  is_permanent            boolean NOT NULL DEFAULT false,
  priority_order          integer,
  claim_hold              boolean NOT NULL DEFAULT false,
  password_enc            text,
  link_sms_enc            text,
  link_sms_bidx           bytea,
  qna_enc                 text,
  active_claim_session_id bigint             -- LOGICAL -> projectm_itune_claim_sessions.id
);

CREATE TABLE IF NOT EXISTS projectm_itune_claim_sessions (
  id           bigserial PRIMARY KEY,
  entry_id     integer NOT NULL,             -- LOGICAL -> projectm_itune_entries.id
  entry_email  text,
  user_id      integer,                      -- LOGICAL -> gamedb_users.id (cross-database)
  username     text,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  released_at  timestamptz,
  start_amount numeric(14,2) NOT NULL,
  end_amount   numeric(14,2),
  amount_used  numeric(14,2),
  outcome      text CHECK (outcome IN ('depleted', 'partial_release', 'unusable', 'rejected')),
  proof_image  text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projectm_itune_issue_log (
  id                           serial PRIMARY KEY,
  entry_id                     integer NOT NULL,  -- LOGICAL -> projectm_itune_entries.id
  entry_email                  text,
  note                         text NOT NULL,
  reported_by_user_id          integer,
  reported_by_username         text,
  reported_at                  timestamptz NOT NULL DEFAULT now(),
  resolved_by_user_id          integer,
  resolved_by_username         text,
  resolved_at                  timestamptz,
  entry_password               text,
  entry_currency               text,
  entry_supplier               text,
  entry_amount                 numeric(14,2),
  entry_link_sms               text,
  entry_qna                    text,
  is_reject                    boolean NOT NULL DEFAULT false,
  reject_confirmed_at          timestamptz,
  reject_confirmed_by_user_id  integer,
  reject_confirmed_by_username text
);

CREATE TABLE IF NOT EXISTS projectm_itune_claim_log (
  id           serial PRIMARY KEY,
  entry_id     integer NOT NULL,             -- LOGICAL -> projectm_itune_entries.id
  entry_email  text,
  action       text NOT NULL
                 CHECK (action IN ('claim', 'release', 'reject', 'reject_confirm', 'reject_decline', 'cancel_reject')),
  user_id      integer,
  username     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  issue_log_id integer                       -- LOGICAL -> projectm_itune_issue_log.id
);

CREATE TABLE IF NOT EXISTS projectm_itune_amount_log (
  id                  serial PRIMARY KEY,
  entry_id            integer NOT NULL,      -- LOGICAL -> projectm_itune_entries.id
  entry_email         text,
  old_amount          numeric(14,2) NOT NULL,
  new_amount          numeric(14,2) NOT NULL,
  changed_by_user_id  integer,
  changed_by_username text,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  image               text
);

CREATE TABLE IF NOT EXISTS projectm_itune_entry_log (
  id                  bigserial PRIMARY KEY,
  entry_id            integer NOT NULL,      -- LOGICAL -> projectm_itune_entries.id
  entry_email         text,
  action              text  NOT NULL CHECK (action IN ('create', 'update', 'delete', 'bulk_delete')),
  changes             jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id             integer,
  username            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  old_values          jsonb,
  new_values          jsonb,
  changed_by_user_id  integer,
  changed_by_username text,
  changed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projectm_itune_admin_log (
  id             bigserial PRIMARY KEY,
  action         text  NOT NULL,
  target_id      integer,
  details        jsonb,
  user_id        integer,
  username       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  category       text NOT NULL CHECK (category IN ('system', 'admin')),
  entry_id       integer,                    -- LOGICAL -> projectm_itune_entries.id
  entry_email    text,
  old_values     jsonb,
  new_values     jsonb,
  actor_user_id  integer,
  actor_username text
);

-- Append-only guard on the admin log.
CREATE OR REPLACE FUNCTION projectm_itune_admin_log_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'projectm_itune_admin_log is append-only';
END;
$fn$;

DROP TRIGGER IF EXISTS projectm_itune_admin_log_no_change ON projectm_itune_admin_log;
CREATE TRIGGER projectm_itune_admin_log_no_change
  BEFORE UPDATE OR DELETE ON projectm_itune_admin_log
  FOR EACH ROW EXECUTE FUNCTION projectm_itune_admin_log_append_only();

CREATE TABLE IF NOT EXISTS projectm_itune_secret_access_log (
  id                    bigserial PRIMARY KEY,
  entry_id              integer NOT NULL,    -- LOGICAL -> projectm_itune_entries.id
  field                 text NOT NULL,
  action                text NOT NULL,
  actor_user_id         integer NOT NULL,
  actor_username        text,
  authorization_context text NOT NULL,
  outcome               text NOT NULL,
  accessed_at           timestamptz NOT NULL DEFAULT now()
);

-- Singleton-style settings tables.
CREATE TABLE IF NOT EXISTS projectm_itune_release_settings (
  -- singleton table: exactly one row, always id = 1
  id                        integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_amount                numeric(14,2) NOT NULL,
  updated_at                timestamptz   NOT NULL DEFAULT now(),
  updated_by_user_id        integer,
  updated_by_username       text,
  claim_paused              boolean NOT NULL DEFAULT false,
  priority_amount_threshold numeric(14,2),
  target_hours              numeric(8,2),
  burn_rate_usd_per_hour    numeric(14,2),
  expected_idle_hours       numeric(8,2),
  claim_warning_hours       numeric(8,2)
);

CREATE TABLE IF NOT EXISTS projectm_itune_status_rules (
  id                  serial PRIMARY KEY,
  rules               jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id  integer,
  updated_by_username text
);

-- ---------------------------------------------------------------------------
-- 6. Legacy tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS games (
  id              serial PRIMARY KEY,
  "order"         integer NOT NULL DEFAULT 0,
  game_name       text NOT NULL,
  region          text NOT NULL,
  vpn             text NOT NULL,
  web_topup       text NOT NULL,
  platform        text NOT NULL,
  server          text NOT NULL,
  image           text NOT NULL,
  currencies      jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_column jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_packs (
  game_id    integer NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  pack_id    text    NOT NULL,
  data       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, pack_id)
);

-- pack_list has no PK, UK or FK in the live database, and uses Thai column names.
CREATE TABLE IF NOT EXISTS pack_list (
  id               bigint,
  sell_price       double precision,
  usdt             double precision,
  kaleoz           double precision,
  "gemที่กด"          text,
  "gemรวม"           bigint,
  "phpที่กด"          text,
  "phpรวม"           bigint,
  "razer_cadที่กด"    double precision,
  "razer_usdที่กด"    double precision,
  "ช่องทางหลัก"        text,
  "ช่องทางสำรอง"       text,
  country          text
);
