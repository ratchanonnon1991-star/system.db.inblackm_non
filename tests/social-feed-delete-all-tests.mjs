import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync("src/server/social-feed-repository.js", "utf8");
const route = fs.readFileSync("src/app/api/social-feed/route.js", "utf8");
const page = fs.readFileSync("src/components/social-feed-page.js", "utf8");

assert.match(repository, /export async function deleteAllSocialPosts/);
assert.match(repository, /DELETE FROM social_feed_posts RETURNING 1/);
assert.match(route, /export async function DELETE\(request\)/);
assert.match(route, /await requireAdmin\(request\)/);
assert.match(page, /ลบโพสต์ทั้งหมด/);
assert.match(page, /<AlertDialog/);

console.log("6 passed");
