import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const commentDialog = read("src/components/social-feed-comment-dialog.js");
const socialFeed = read("src/components/social-feed-page.js");
const marketCompare = read("src/components/gameinfo-market-compare-page.js");
const competitorCompare = read("src/components/gameinfo-market-competitor-compare-page.js");
const marketMapping = read("src/components/gameinfo-market-mapping-page.js");
const marketManager = read("src/components/gameinfo-market-manager.js");
const rateReferences = read("src/components/gameinfo-market-rate-references-page.js");
const packCompare = read("src/components/gameinfo-pack-price-compare.js");
const russiaCheck = read("src/components/gameinfo-russia-check-page.js");

assert.match(commentDialog, /disabled={!accounts\.length}/);
assert.match(commentDialog, /accounts\.length \? "เลือกเครื่อง" : "ไม่มี"/);
assert.match(socialFeed, /eligibleAccounts\.length \? "เลือกเครื่องรับคิว" : "ไม่มี"/);
assert.match(socialFeed, /categories\.length \? undefined : "ไม่มี"/);
assert.match(marketCompare, /enabledMarkets\.length \? undefined : "ไม่มี"/);
assert.match(competitorCompare, /baselineItems\.length \? undefined : "ไม่มี"/);
assert.match(marketMapping, /enabledMarkets\.length \? undefined : "ไม่มี"/);
assert.match(marketManager, /gamesLoaded && !hasGameOptions \? "ไม่มี"/);
assert.match(marketManager, /hasColumnOptions \? "เลือกคอลัมน์อ้างอิงราคา" : "ไม่มี"/);
assert.match(rateReferences, /availableGames\.length \? "เลือกเกม" : "ไม่มี"/);
assert.match(packCompare, /productTypes\.length \? undefined : "ไม่มี"/);
assert.match(packCompare, /sellerItems\.length \? undefined : "ไม่มี"/);
assert.match(russiaCheck, /gameItems\.length \? undefined : "ไม่มี"/);

console.log("13 passed");
