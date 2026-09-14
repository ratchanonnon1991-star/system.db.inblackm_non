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
      receivedTimes.push(args[4]);
      assert.match(sql, /ON CONFLICT\(source_id,external_post_id\) DO UPDATE/);
      if (stored.has(args[1])) {
        if (args[2].length > stored.get(args[1]).length) stored.set(args[1], args[2]);
        return { rows: [{ id: 1, inserted: false }] };
      }
      stored.set(args[1], args[2]);
      return { rows: [{ id: stored.size, inserted: true }] };
    }
    return { rows: [] };
  },
};
const context = vm.createContext({ ensureSchema: async () => {}, getSocialPool: () => ({ connect: async () => client }), categoryMatchesRules: () => true, URL });
const source = fs.readFileSync("src/server/social-feed-repository.js", "utf8");
assert.doesNotMatch(source, /const where = \["p\.posted_at IS NOT NULL"\]/);
assert.match(source, /ORDER BY p\.posted_at DESC NULLS LAST,p\.id DESC/);
assert.match(source, /pagingSql = "LIMIT 1000"/, "show-all mode must be bounded");
assert.match(source, /NOT s\.requires_login OR a\.platform_account_id<>''/, "public collectors must not receive login-only groups");
assert.equal((source.match(/WITH active AS \(SELECT id,platform_account_id,/g) || []).length, 2, "active collector CTEs must expose platform_account_id");
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
