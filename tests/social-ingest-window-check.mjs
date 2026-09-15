import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const stored = new Map();
const receivedTimes = [];
const client = {
  release() {},
  async query(sql, args) {
    if (sql.startsWith("SELECT * FROM social_feed_rules")) return { rows: [] };
    if (sql.startsWith("SELECT * FROM social_feed_sources")) return { rows: [{ id: 1, category_id: 1, facebook_url: "https://www.facebook.com/groups/1/" }] };
    if (sql.startsWith("INSERT INTO social_feed_posts(")) {
      receivedTimes.push(args[5]);
      assert.match(sql, /ON CONFLICT\(source_id,external_post_id\) DO UPDATE/);
      if (stored.has(args[1])) {
        if (args[3].length > stored.get(args[1]).length) stored.set(args[1], args[3]);
        return { rows: [{ id: 1, inserted: false }] };
      }
      stored.set(args[1], args[3]);
      return { rows: [{ id: stored.size, inserted: true }] };
    }
    return { rows: [] };
  },
};
const context = vm.createContext({ ensureSchema: async () => {}, getSocialPool: () => ({ connect: async () => client }), categoryMatchesRules: () => true, URL });
const source = fs.readFileSync("src/server/social-feed-repository.js", "utf8");
assert.match(source, /ALTER TABLE social_feed_collector_accounts ADD COLUMN IF NOT EXISTS platform_account_id/i, "existing collector tables must migrate before account queries run");
assert.equal((source.match(/SELECT id,platform_account_id,row_number\(\) OVER\(ORDER BY id\)/g) || []).length, 2, "active collector CTEs must expose platform account IDs");
assert.match(source, /active BOOLEAN NOT NULL DEFAULT FALSE/i, "work leases must track an active read");
assert.match(source, /SET active=FALSE,expires_at=/, "finishing a source must clear its active read");
assert.match(source, /currentSource: currentReadByInstance/, "collector state must expose the source currently being read");
assert.match(source, /ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT ''/i, "existing post tables must migrate the censored author field");
assert.match(source, /CREATE TABLE IF NOT EXISTS social_feed_comment_jobs/i, "comment jobs must be persisted");
assert.match(source, /FOR UPDATE OF j SKIP LOCKED/, "comment claims must lock one queued job");
assert.match(source, /SET status='executing'/, "claimed comment jobs must become non-requeueing executions");
assert.match(source, /LIMIT 20\) recent\)/, "collector assignments must include a bounded set of recent stored post IDs");
assert.match(source, /queue_state='needs_assignment'/, "groups that need joining must be parked outside the automatic queue");
assert.match(source, /assigned_account_id=a\.id/, "parked groups must support explicit collector assignment");
assert.doesNotMatch(source, /const where = \["p\.posted_at IS NOT NULL"\]/);
assert.match(source, /ORDER BY p\.posted_at DESC NULLS LAST,p\.id DESC/);
assert.match(source, /pagingSql = "LIMIT 1000"/, "show-all mode must be bounded");
assert.match(source, /NOT s\.requires_login OR a\.platform_account_id<>''/, "public collectors must not receive login-only groups");
assert.match(source, /SET facebook_url='https:\/\/www\.facebook\.com\/groups\/' \|\| facebook_group_id \|\| '\/'/, "stored /about URLs must be normalized");
vm.runInContext(source.slice(source.indexOf("export async function ingestSocialPosts")).replace("export ", ""), context);
const post = { sourceId: "1", externalPostId: "1_123", message: "original", postedAt: new Date(Date.now() - 60000).toISOString() };
context.items = [post, { ...post, message: "changed" }, { ...post, externalPostId: "old", postedAt: new Date(Date.now() - 7200000).toISOString() }, { ...post, externalPostId: "unknown", postedAt: null }];
const result = await vm.runInContext("ingestSocialPosts(items)", context);
assert.equal(result.ingested, 3);
assert.equal(result.existing, 1);
assert.equal(stored.has("old"), true);
assert.equal(stored.has("unknown"), true);
assert.equal(stored.get("1_123"), "original");
assert.equal(receivedTimes[0], post.postedAt);
assert.equal(receivedTimes[2], context.items[2].postedAt);
assert.equal(receivedTimes[3], null, "unknown time must not become collection time");
context.items = [
  { ...post, postedAt: "invalid" },
  { ...post, postedAt: new Date(Date.now() + 86400000).toISOString() },
];
await vm.runInContext("ingestSocialPosts(items)", context);
assert.deepEqual(receivedTimes.slice(-2), [null, null]);
console.log("PASS: all ages and unknown times accepted, duplicate keeps the fuller stored message");
