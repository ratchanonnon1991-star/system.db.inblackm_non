\connect topup_inblackm

CREATE TABLE IF NOT EXISTS social_feed_categories (id bigserial PRIMARY KEY,name text NOT NULL UNIQUE,sort_order integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_feed_sources (id bigserial PRIMARY KEY,category_id bigint NOT NULL REFERENCES social_feed_categories(id) ON DELETE CASCADE,name text NOT NULL,facebook_url text NOT NULL UNIQUE,facebook_group_id text NOT NULL UNIQUE,enabled boolean NOT NULL DEFAULT true,last_seen_at timestamptz,last_error text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS login_account text NOT NULL DEFAULT '';
ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'unchecked';
ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS session_checked_at timestamptz;
ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS access_note text NOT NULL DEFAULT '';
ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS platform_account_id text NOT NULL DEFAULT '';
ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS requires_login boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS social_feed_collector_accounts (id bigserial PRIMARY KEY,instance_id text NOT NULL UNIQUE,label text NOT NULL,platform_account_id text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'unknown',enabled boolean NOT NULL DEFAULT true,last_seen_at timestamptz NOT NULL DEFAULT now(),session_checked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_feed_source_account_status (source_id bigint NOT NULL REFERENCES social_feed_sources(id) ON DELETE CASCADE,account_id bigint NOT NULL REFERENCES social_feed_collector_accounts(id) ON DELETE CASCADE,status text NOT NULL DEFAULT 'unknown',note text NOT NULL DEFAULT '',checked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_id,account_id));
CREATE TABLE IF NOT EXISTS social_feed_rules (id bigserial PRIMARY KEY,category_id bigint NOT NULL REFERENCES social_feed_categories(id) ON DELETE CASCADE,name text NOT NULL,mode text NOT NULL CHECK(mode IN ('all','any','exclude')),terms text[] NOT NULL,enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_feed_posts (id bigserial PRIMARY KEY,source_id bigint NOT NULL REFERENCES social_feed_sources(id) ON DELETE CASCADE,external_post_id text NOT NULL,message text NOT NULL,original_url text NOT NULL,posted_at timestamptz NOT NULL,ingested_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source_id,external_post_id));
CREATE INDEX IF NOT EXISTS social_feed_posts_time_idx ON social_feed_posts(posted_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS social_feed_post_categories (post_id bigint NOT NULL REFERENCES social_feed_posts(id) ON DELETE CASCADE,category_id bigint NOT NULL REFERENCES social_feed_categories(id) ON DELETE CASCADE,PRIMARY KEY(post_id,category_id));
CREATE TABLE IF NOT EXISTS social_feed_tags (id bigserial PRIMARY KEY,name text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_feed_post_tags (post_id bigint NOT NULL REFERENCES social_feed_posts(id) ON DELETE CASCADE,tag_id bigint NOT NULL REFERENCES social_feed_tags(id) ON DELETE CASCADE,PRIMARY KEY(post_id,tag_id));
CREATE TABLE IF NOT EXISTS social_feed_saved_posts (post_id bigint NOT NULL REFERENCES social_feed_posts(id) ON DELETE CASCADE,user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(post_id,user_id));
