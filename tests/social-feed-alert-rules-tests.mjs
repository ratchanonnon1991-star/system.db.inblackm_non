import assert from "node:assert/strict";
import fs from "node:fs";
import { alertRuleMatches, normalizeAlertRule } from "../src/lib/social-feed-alert-rules.js";

const rule = normalizeAlertRule({
  name: "ลูกค้าเติมเงิน",
  groupMode: "any",
  groups: [
    { mode: "all", terms: ["ขาย", "เพชร"] },
    { mode: "all", terms: ["ขาย", "เงิน"] },
  ],
});

assert.equal(alertRuleMatches(rule, "ขายไอดี รับเป็นเงินสด"), true);
assert.equal(alertRuleMatches(rule, "เพชรราคาถูก"), false);
assert.equal(alertRuleMatches({ ...rule, groupMode: "all" }, "ขายเพชร รับเงิน"), true);
assert.equal(alertRuleMatches({ ...rule, groupMode: "all" }, "ขายเพชร"), false);
assert.equal(normalizeAlertRule({ groups: [{ terms: ["x".repeat(500)] }] }).groups[0].terms[0].length, 120);

const repository = fs.readFileSync("src/server/social-feed-repository.js", "utf8");
const page = fs.readFileSync("src/components/social-feed-rules-page.js", "utf8");
const listPostsPath = repository.match(/export async function listSocialAlertPosts[\s\S]*?(?=export async function deleteAllSocialPosts)/)?.[0] || "";
assert.match(repository, /CREATE TABLE IF NOT EXISTS social_feed_alert_rule_posts/);
assert.match(repository, /alertRuleMatches\(rule, message\)/);
assert.match(listPostsPath, /FROM social_feed_alert_rule_posts/);
assert.doesNotMatch(listPostsPath, /ILIKE/);
assert.match(repository, /pg_advisory_xact_lock/);
assert.match(page, /AbortController/);
assert.match(page, /requestRef\.current\.sequence !== sequence/);

console.log("12 passed");
