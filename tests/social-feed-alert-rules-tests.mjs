import assert from "node:assert/strict";
import fs from "node:fs";
import { alertRuleMatches, normalizeAlertRule, reconcileAlertRuleView } from "../src/lib/social-feed-alert-rules.js";

const rule = normalizeAlertRule({
  name: "ลูกค้าเติมเงิน",
  includeMode: "all",
  includeTerms: ["ขาย", "เพชร"],
  excludeMode: "any",
  excludeTerms: ["ปิดการขาย"],
});

assert.equal(alertRuleMatches(rule, "ขายไอดี รับเป็นเงินสด"), false);
assert.equal(alertRuleMatches(rule, "ขายเพชร ราคาดี"), true);
assert.equal(alertRuleMatches(rule, "เพชรราคาถูก"), false);
assert.equal(alertRuleMatches(rule, "ขายเพชร ปิดการขายแล้ว"), false);
assert.equal(normalizeAlertRule({ groups: [{ terms: ["x".repeat(500)] }] }).groups[0].terms[0].length, 120);
const anyRule = normalizeAlertRule({ includeMode: "any", includeTerms: ["ขาย", "เติม"], excludeTerms: [] });
assert.equal(alertRuleMatches(anyRule, "รับเติมเกม"), true);
const excludeAllRule = normalizeAlertRule({ includeTerms: ["ขาย"], excludeMode: "all", excludeTerms: ["ปิด", "ขายแล้ว"] });
assert.equal(alertRuleMatches(excludeAllRule, "ขายของ ปิดรับชั่วคราว"), true);
assert.equal(alertRuleMatches(excludeAllRule, "ขายของ ปิด ขายแล้ว"), false);
const legacyRule = normalizeAlertRule({ groupMode: "any", groups: [{ mode: "all", terms: ["ขาย", "เพชร"] }, { mode: "exclude", terms: ["สแปม"] }] });
assert.deepEqual(legacyRule.includeTerms, ["ขาย", "เพชร"]);
assert.deepEqual(legacyRule.excludeTerms, ["สแปม"]);
assert.equal(legacyRule.excludeMode, "any");
assert.deepEqual(reconcileAlertRuleView({ selectedId: "8", pagination: { totalPages: 2 } }, "7", 5), { selectedId: "8", page: 2, selectionChanged: true });
assert.deepEqual(reconcileAlertRuleView({ selectedId: "8", pagination: { totalPages: 5 } }, "8", 3), { selectedId: "8", page: 3, selectionChanged: false });

const repository = fs.readFileSync("src/server/social-feed-repository.js", "utf8");
const page = fs.readFileSync("src/components/social-feed-rules-page.js", "utf8");
const route = fs.readFileSync("src/app/api/social-feed/alert-rules/route.js", "utf8");
const listPostsPath = repository.match(/export async function listSocialAlertPosts[\s\S]*?(?=export async function deleteAllSocialPosts)/)?.[0] || "";
assert.match(repository, /CREATE TABLE IF NOT EXISTS social_feed_alert_rule_posts/);
assert.match(repository, /alertRuleMatches\(rule, message\)/);
assert.match(listPostsPath, /FROM social_feed_alert_rule_posts/);
assert.doesNotMatch(listPostsPath, /ILIKE/);
assert.match(repository, /pg_advisory_xact_lock/);
assert.match(page, /AbortController/);
assert.match(page, /requestRef\.current\.sequence !== sequence/);
assert.match(repository, /export async function updateSocialAlertRule/);
assert.match(repository, /UPDATE social_feed_alert_rules SET name=/);
assert.match(route, /export async function PATCH/);
assert.match(page, /แก้ไข Rule/);
assert.match(page, /\(createOpen \|\| editingRule\) && <RuleDialog/);
assert.match(page, /includeTerms\.length >= MAX_TERMS/);
assert.match(repository, /clock_timestamp\(\) AS started_at/);
assert.match(repository, /WHERE updated_at >= \$1/);

console.log("28 passed");
