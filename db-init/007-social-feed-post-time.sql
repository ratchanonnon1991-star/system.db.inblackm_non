-- Unknown publication times remain stored but do not appear in the dated feed.
ALTER TABLE social_feed_posts ALTER COLUMN posted_at DROP NOT NULL;
