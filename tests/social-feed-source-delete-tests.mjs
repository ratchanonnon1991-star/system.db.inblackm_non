import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync("src/server/social-feed-repository.js", "utf8");
const route = fs.readFileSync("src/app/api/social-feed/sources/route.js", "utf8");
const categoryRoute = fs.readFileSync("src/app/api/social-feed/categories/route.js", "utf8");
const page = fs.readFileSync("src/components/social-feed-page.js", "utf8");

assert.match(repository, /export async function deleteSocialSources/);
assert.doesNotMatch(repository, /schemaReady\s*=\s*getSocialPool\(\)\.query\(schemaSql\)\.then\([^\n]*seedSql/);
assert.match(repository, /export async function seedSocialFeedDefaults/);
assert.match(repository, /DELETE FROM social_feed_sources WHERE id=\$1 RETURNING 1/);
assert.match(repository, /DELETE FROM social_feed_categories RETURNING 1/);
assert.match(route, /export async function DELETE[\s\S]*requireAdmin[\s\S]*deleteSocialSources/);
assert.match(page, /ลบทุกกลุ่ม/);
assert.match(page, /setDeleteSourceTarget\(source\)/);
assert.match(page, /กลุ่มนี้ รวมถึงโพสต์และสถานะตรวจสอบที่ผูกไว้จะถูกลบ/);
assert.match(repository, /export async function deleteSocialCategory/);
assert.match(repository, /DELETE FROM social_feed_categories WHERE id=\$1 RETURNING 1/);
assert.match(categoryRoute, /export async function DELETE[\s\S]*requireAdmin[\s\S]*deleteSocialCategory/);
assert.match(page, /setDeleteCategoryTarget\(group\)/);
assert.match(page, /ยืนยันลบหมวดหมู่/);
assert.match(page, /setSourceCategoryId\(group\.id\)/);
assert.match(page, /initialCategoryId=\{sourceCategoryId\}/);

console.log("PASS: social feed supports deleting sources and whole categories");
