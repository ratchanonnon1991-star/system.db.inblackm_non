-- Schema: inblackm_system (15 base tables)
-- Generated from docs/database-erd.md (snapshot 2026-08-22).
\connect inblackm_system

-- ---------------------------------------------------------------------------
-- 1. System and queries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gamedb_connections (
  id           serial PRIMARY KEY,
  name         varchar(255) NOT NULL,
  host         varchar(255) NOT NULL,
  port         integer      NOT NULL DEFAULT 5432,
  database     varchar(255) NOT NULL,
  username     varchar(255) NOT NULL,
  password_enc text,
  ssl          boolean      NOT NULL DEFAULT false,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamedb_connection_flags (
  -- LOGICAL -> gamedb_connections.id (0 is the sentinel for the primary DB)
  connection_id        integer PRIMARY KEY,
  allow_write          boolean NOT NULL DEFAULT false,
  statement_timeout_ms integer,
  max_rows             integer,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamedb_queries (
  id            serial PRIMARY KEY,
  name          varchar(255) NOT NULL,
  description   text,
  sql_text      text         NOT NULL,
  layout        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  sort_order    integer      NOT NULL DEFAULT 0,
  created_by    varchar(255),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  connection_id integer REFERENCES gamedb_connections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS gamedb_shares (
  id         serial PRIMARY KEY,
  token      varchar(64) NOT NULL UNIQUE,
  query_id   integer     NOT NULL REFERENCES gamedb_queries(id) ON DELETE CASCADE,
  created_by varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Only one live (non-revoked) share per query.
CREATE UNIQUE INDEX IF NOT EXISTS gamedb_shares_live_query
  ON gamedb_shares (query_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS gamedb_edit_log (
  id          serial PRIMARY KEY,
  query_id    integer,          -- LOGICAL -> gamedb_queries.id
  actor       varchar(255),
  table_name  varchar(255) NOT NULL,
  pk_column   varchar(255) NOT NULL,
  pk_value    text,
  column_name varchar(255) NOT NULL,
  old_value   text,
  new_value   text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  ip          varchar(64),
  user_agent  text
);

CREATE TABLE IF NOT EXISTS gamedb_filter_views (
  id                serial PRIMARY KEY,
  query_id          integer      NOT NULL,   -- LOGICAL -> gamedb_queries.id
  name              varchar(120) NOT NULL,
  row_filter        text         NOT NULL DEFAULT '',
  lookup_row_filter jsonb,
  param_values      jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_by        varchar(255),
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamedb_snapshots (
  id         serial PRIMARY KEY,
  query_id   integer      NOT NULL,          -- LOGICAL -> gamedb_queries.id
  name       varchar(255) NOT NULL,
  params     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  columns    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  rows       jsonb        NOT NULL DEFAULT '[]'::jsonb,
  row_count  integer      NOT NULL DEFAULT 0,
  created_by varchar(255),
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamedb_user_layouts (
  user_id    integer     NOT NULL,           -- LOGICAL -> gamedb_users.id
  query_id   integer     NOT NULL,           -- LOGICAL -> gamedb_queries.id
  layout     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, query_id)
);

CREATE TABLE IF NOT EXISTS gamedb_views (
  id               serial PRIMARY KEY,
  name             varchar(255) NOT NULL,
  description      text,
  config           jsonb        NOT NULL DEFAULT '{}'::jsonb,
  is_public        boolean      NOT NULL DEFAULT false,
  is_default       boolean      NOT NULL DEFAULT false,
  shared_with      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  created_by       varchar(255),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  is_read_only     boolean      NOT NULL DEFAULT false,
  owner_only       boolean      NOT NULL DEFAULT false,
  allow_staff_edit boolean      NOT NULL DEFAULT false,
  allow_user_edit  boolean      NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. Users and permissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gamedb_users (
  id            serial PRIMARY KEY,
  username      varchar(64) NOT NULL UNIQUE,
  display_name  varchar(255),
  password_hash text        NOT NULL,
  role          varchar(16) NOT NULL DEFAULT 'staff'
                  CHECK (role IN ('admin', 'staff', 'user')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamedb_user_preferences (
  user_id         integer PRIMARY KEY,       -- LOGICAL -> gamedb_users.id
  default_view_id integer,                   -- LOGICAL -> gamedb_views.id
  role_override   varchar(16) CHECK (role_override IS NULL OR role_override = 'user'),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  projectm_role   varchar(16) CHECK (projectm_role IS NULL OR projectm_role IN ('admin', 'topup')),
  itune_role_id   integer,                   -- LOGICAL -> topup_inblackm.projectm_itune_roles.id
  can_write_data  boolean NOT NULL DEFAULT false,
  can_update_data boolean NOT NULL DEFAULT false,
  gameinfo_role   varchar(16) CHECK (gameinfo_role IS NULL OR gameinfo_role IN ('admin', 'topup'))
);

CREATE TABLE IF NOT EXISTS gamedb_user_permissions (
  user_id        integer     NOT NULL,       -- LOGICAL -> gamedb_users.id
  permission_key varchar(96) NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS gamedb_permission_migrations (
  key        varchar(64) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gamedb_login_log (
  id         serial PRIMARY KEY,
  username   varchar(255) NOT NULL,
  success    boolean      NOT NULL,
  reason     varchar(255),
  ip         varchar(64),
  created_at timestamptz  NOT NULL DEFAULT now(),
  user_agent text
);

CREATE TABLE IF NOT EXISTS gamedb_sso_map (
  id               serial PRIMARY KEY,
  hiring_email     varchar(255) NOT NULL UNIQUE,
  gamedb_username  varchar(64)  NOT NULL,     -- LOGICAL -> gamedb_users.username
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- Schema drift note (docs/database-erd.md): this table has DDL in
-- src/server/gamedb-cell-notes.js but does not exist in the live database,
-- so it is intentionally not created here.
