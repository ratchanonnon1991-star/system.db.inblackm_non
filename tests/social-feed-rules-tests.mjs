import assert from "node:assert/strict";
import { categoryMatchesRules, normalizeRuleTerms, ruleMatchesText } from "@/lib/social-feed-rules";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

test("normalizes comma separated Thai terms", () => {
  assert.deepEqual(normalizeRuleTerms(" เติม, เกม,เติม "), ["เติม", "เกม"]);
});

test("ALL requires every term", () => {
  const rule = { enabled: true, mode: "all", terms: ["เติม", "เกม"] };
  assert.equal(ruleMatchesText(rule, "หาร้านเติมเกม"), true);
  assert.equal(ruleMatchesText(rule, "เติมเงิน"), false);
});

test("ANY acts as a plus rule", () => {
  assert.equal(ruleMatchesText({ enabled: true, mode: "any", terms: ["ซื้อ", "ขาย"] }, "ขายไอดี"), true);
});

test("positive rules are ORed and exclude vetoes", () => {
  const rules = [
    { enabled: true, mode: "all", terms: ["เติม", "เกม"] },
    { enabled: true, mode: "any", terms: ["ขาย"] },
    { enabled: true, mode: "exclude", terms: ["สแปม"] },
  ];
  assert.equal(categoryMatchesRules(rules, "ขายไอดี"), true);
  assert.equal(categoryMatchesRules(rules, "เติมเกม ราคาดี"), true);
  assert.equal(categoryMatchesRules(rules, "ขายไอดี สแปม"), false);
});

console.log(`${passed} passed`);
