import assert from "node:assert/strict";
import { parseSocialFeedSearchTerms } from "../src/lib/social-feed-search.js";

assert.deepEqual(parseSocialFeedSearchTerms(" เติมเกม, ราคาดี "), ["เติมเกม", "ราคาดี"]);
assert.deepEqual(parseSocialFeedSearchTerms("ขาย,ขาย,, ซื้อ"), ["ขาย", "ซื้อ"]);

console.log("2 assertions");
