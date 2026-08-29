import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GAMEINFO_COMPARE_PAGE_SIZE,
  GAMEINFO_COMPARE_SELLER_LIMIT,
  calculateGameinfoPriceDifference,
  buildGameinfoOrderedMappingDraft,
  gameinfoMarketPackDisplayName,
  buildGameinfoOwnSellerReferenceGroups,
  marketPackIdentity,
  nextGameinfoMarketRunAt,
  normalizeMarketIdentityPart,
  normalizeMarketPage,
  reconcileGameinfoPackMappingTargets,
  selectGameinfoCompareSellerKeys,
} from "@/lib/gameinfo-market-system.js";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer.js";
import { gameinfoDistinctColorStyleMap } from "@/lib/gameinfo-stable-color.js";
import { buildGameinfoMarketPackPriceMap } from "@/lib/gameinfo-market-prices.js";

assert.equal(marketPackIdentity("kaleoz", { name: "  128 ZEMS ", category: "Coins", amount: 128 }), "kaleoz:128 zems|coins|128");
assert.equal(marketPackIdentity("kaleoz", { key: "own:123", name: "เปลี่ยนชื่อได้" }), "kaleoz:เปลี่ยนชื่อได้||");
assert.equal(marketPackIdentity("itemku", { key: "denomination-128", name: "เปลี่ยนชื่อได้" }), "itemku:denomination-128");
assert.equal(calculateGameinfoPriceDifference(100, 95.01).alert, false);
assert.equal(calculateGameinfoPriceDifference(100, 95).alert, true);
assert.equal(calculateGameinfoPriceDifference(100, 105).alert, true);
assert.equal(calculateGameinfoPriceDifference(0, 10).kind, "data_quality");
assert.equal(calculateGameinfoPriceDifference(100, null).kind, "missing_price");
assert.equal(nextGameinfoMarketRunAt(new Date("2026-08-29T01:59:59Z")).toISOString(), "2026-08-29T02:00:00.000Z");
assert.equal(nextGameinfoMarketRunAt(new Date("2026-08-29T02:00:00Z")).toISOString(), "2026-08-30T02:00:00.000Z");
const comparisonPrices = buildGameinfoMarketPackPriceMap({
  currencies: [{ categories: [{ id: "topup", packs: [{ id: "p1", name: "100 Coins", price: 100 }] }] }],
  computedColumns: [{ key: "market_kaleoz", label: "Kaleoz", kind: "market", marketKey: "kaleoz", enabled: true, formula: "[ราคา] * 1.35" }],
}, { gameName: "Demo" }, "kaleoz");
assert.equal(comparisonPrices.get("p1").price, 135);
const missingMarketPrice = buildGameinfoMarketPackPriceMap({
  currencies: [{ categories: [{ id: "topup", packs: [{ id: "p1", price: 100 }] }] }],
  computedColumns: [],
}, {}, "itemku");
assert.equal(missingMarketPrice.get("p1").price, null);
const orderedAfterSkip = buildGameinfoOrderedMappingDraft(
  [{ id: "g1" }, { id: "g2" }, { id: "g3" }, { id: "g4" }],
  [{ externalPackKey: "m1" }, { externalPackKey: "m2" }],
  new Set(["g1"])
);
assert.deepEqual(orderedAfterSkip, [
  { packId: "g2", packName: "g2", externalPackKey: "m1", marketPackName: "m1" },
  { packId: "g3", packName: "g3", externalPackKey: "m2", marketPackName: "m2" },
]);
const mappingColors = gameinfoDistinctColorStyleMap(Array.from({ length: 500 }, (_, index) => `mapping-${index}`));
assert.equal(new Set([...mappingColors.values()].map((style) => style["--gameinfo-tag-hue"])).size, 500);

const rebound = normalizeMarketPage("kaleoz", { game: "zepeto", productType: "coins", groups: [{ packLabel: "128 Zem", quantity: 128, offers: [{ itemId: "new-listing", seller: "Shop", price: 95 }] }] });
assert.equal(rebound.packs[0].externalPackKey, "kaleoz:128 zem|coins|128");
assert.equal(rebound.packs[0].listingId, "new-listing");
const duplicateSeller = normalizeMarketPage("kaleoz", {
  game: "zepeto",
  productType: "coins",
  groups: [{
    packLabel: "128 Zem",
    quantity: 128,
    offers: [
      { itemId: "listing-expensive", seller: "Shop", price: 100 },
      { itemId: "listing-cheap", seller: " shop ", price: 95 },
    ],
  }],
});
assert.equal(duplicateSeller.packs[0].offers.length, 1);
assert.equal(duplicateSeller.packs[0].offers[0].listingId, "listing-cheap");
const ownSellerReferencePage = buildGameinfoOwnSellerReferenceGroups("kaleoz", {
  groups: [{
    key: "zem",
    packLabel: "Zem",
    quantity: 100,
    offers: [
      { itemId: "own-1", title: "100 Zem แบบที่ 1", quantity: 100, seller: "InblackmTH", price: 90 },
      { itemId: "own-2", title: "100 Zem แบบที่ 2", quantity: 100, seller: " inblackmth ", price: 95 },
      { itemId: "own-3", title: "100 Zem แบบที่ 3", quantity: 100, seller: "InblackmTH", price: 100 },
      { itemId: "own-4", title: "100 Zem แบบที่ 3", quantity: 100, seller: "SecondOwnShop", price: 101 },
      { itemId: "other-1", title: "100 Zem", quantity: 100, seller: "OtherShop", price: 80 },
    ],
  }],
}, ["InblackmTH", "SecondOwnShop"]);
assert.equal(ownSellerReferencePage.groups.length, 3);
assert.deepEqual(ownSellerReferencePage.groups.map((group) => group.packLabel), ["100 Zem แบบที่ 1", "100 Zem แบบที่ 2", "100 Zem แบบที่ 3"]);
assert.deepEqual(ownSellerReferencePage.groups.map((group) => group.key), ["own-name:100 zem แบบที่ 1", "own-name:100 zem แบบที่ 2", "own-name:100 zem แบบที่ 3"]);
assert.ok(ownSellerReferencePage.groups.every((group) => group.offers.some((offer) => ["inblackmth", "secondownshop"].includes(normalizeMarketIdentityPart(offer.seller)))));
const ownSellerCatalog = normalizeMarketPage("kaleoz", { game: "zepeto", productTypeLabel: "ทุกหมวดหมู่", ...ownSellerReferencePage });
assert.equal(ownSellerCatalog.packs.length, 3);
assert.equal(new Set(ownSellerCatalog.packs.map((pack) => pack.externalPackKey)).size, 3);
assert.equal(ownSellerCatalog.packs[2].offers.length, 2);
const renamedOwnSellerCatalog = normalizeMarketPage("kaleoz", {
  game: "zepeto",
  productTypeLabel: "ทุกหมวดหมู่",
  ...buildGameinfoOwnSellerReferenceGroups("kaleoz", {
    groups: [{ offers: [{ itemId: "own-1", title: "แพ็กใหม่", quantity: 200, seller: "InblackmTH", price: 200 }] }],
  }, ["InblackmTH"]),
});
assert.notEqual(renamedOwnSellerCatalog.packs[0].externalPackKey, ownSellerCatalog.packs[0].externalPackKey);
const ambiguous = normalizeMarketPage("kaleoz", { game: "zepeto", productType: "coins", groups: [{ packLabel: "128 Zem", quantity: 128 }, { packLabel: "128 Zem", quantity: 128 }] });
assert.equal(ambiguous.packs.length, 0);
assert.equal(ambiguous.ambiguities.length, 1);
assert.equal(GAMEINFO_COMPARE_PAGE_SIZE, 50);
assert.equal(GAMEINFO_COMPARE_SELLER_LIMIT, 200);
const compareSellers = [
  { value: "a" }, { value: "b" }, { value: "c" }, { value: "d" }, { value: "e" }, { value: "f" },
];
assert.deepEqual(selectGameinfoCompareSellerKeys(compareSellers, ["f"], []), ["f", "a", "b", "c", "d"]);
assert.deepEqual(selectGameinfoCompareSellerKeys(compareSellers, ["f"], ["b", "e"]), ["f", "b", "e"]);
const reconnectPlan = reconcileGameinfoPackMappingTargets(
  [{ packId: "deleted", gameinfoPackName: "128 zem" }],
  [{ id: "new-pack", name: "128 ZEM" }]
);
assert.equal(reconnectPlan.reconnect[0].pack.id, "new-pack");
assert.equal(reconnectPlan.remove.length, 0);
const ambiguousReconnectPlan = reconcileGameinfoPackMappingTargets(
  [{ packId: "deleted", gameinfoPackName: "128 zem" }],
  [{ id: "new-a", name: "128 ZEM" }, { id: "new-b", name: "128 zem" }]
);
assert.equal(ambiguousReconnectPlan.reconnect.length, 0);
assert.equal(ambiguousReconnectPlan.remove.length, 1);
const marketColumn = sanitizeComputedColumns([{ key: "market_kaleoz", label: "Kaleoz", formula: "[ราคา]", kind: "market", marketKey: "kaleoz", enabled: false }])[0];
assert.equal(marketColumn.kind, "market");
assert.equal(marketColumn.enabled, false);

const schema = readFileSync(new URL("../db-init/005-gameinfo-market-system.sql", import.meta.url), "utf8");
assert.match(schema, /PRIMARY KEY \(game_id, data_mode, market, pack_id\)/);
assert.match(schema, /UNIQUE \(game_id, data_mode, market, external_game_key, external_pack_key\)/);
assert.match(schema, /WHERE status IN \('queued', 'running'\)/);
const compareRoute = readFileSync(new URL("../src/app/api/gameinfo/pack-price-compare/route.js", import.meta.url), "utf8");
assert.doesNotMatch(compareRoute, /fetchKaleozPage|fetchItemkuPage/);
assert.match(compareRoute, /allSellers.*=== "1"/);
assert.match(compareRoute, /includeCompetitors: q\.get\("competitors"\)/);
assert.match(compareRoute, /ownOnly: q\.get\("ownOnly"\)/);
const ownComparePage = readFileSync(new URL("../src/components/gameinfo-market-compare-page.js", import.meta.url), "utf8");
assert.match(ownComparePage, /ownOnly: "1"/);
assert.doesNotMatch(ownComparePage, /Seller เพิ่มเติม|Difference/);
const sellerCompareRoute = readFileSync(new URL("../src/app/gameinfo/[lang]/seller-price-compare/page.js", import.meta.url), "utf8");
assert.match(sellerCompareRoute, /fetchKaleozPage[\s\S]*fetchItemkuPage[\s\S]*GameinfoPackPriceCompare/);
assert.match(sellerCompareRoute, /listGameinfoOwnSellers\(provider\)[\s\S]*availableSellerByKey[\s\S]*baselineSeller/);
const competitorPage = readFileSync(new URL("../src/components/gameinfo-market-competitor-compare-page.js", import.meta.url), "utf8");
assert.match(competitorPage, /competitors: selectedSellers === null \? "1" : "0"/);
assert.match(competitorPage, /ใช้ร้านของเราที่ตั้งไว้เป็นค่าเริ่มต้น/);
assert.match(competitorPage, /ค้นหาชื่อ Pack[\s\S]*แพงกว่า[\s\S]*ถูกกว่า[\s\S]*ต่ำสุด[\s\S]*สูงสุด/);
assert.match(competitorPage, /orderedSellers[\s\S]*activeBaseline[\s\S]*bg-linear-surface-4 text-white/);
assert.doesNotMatch(competitorPage, />ร้านเรา<|>อ้างอิง<|>ราคาอ้างอิง</);
assert.match(competitorPage, /startSellerPaint[\s\S]*paintSeller[\s\S]*กดค้างแล้วลากเพื่อเลือกหลายรายการ/);
assert.match(competitorPage, /selectAllSellers[\s\S]*clearSellers[\s\S]*เลือกทั้งหมด[\s\S]*ล้าง/);
assert.match(competitorPage, /TooltipProvider[\s\S]*SellerOfferCell[\s\S]*ตรวจต้นทาง[\s\S]*ดูรายการ/);
assert.match(competitorPage, /openSource[\s\S]*externalPackKey[\s\S]*PackSourceDialog/);
const catalogRoute = readFileSync(new URL("../src/app/api/gameinfo/markets/[market]/catalog/route.js", import.meta.url), "utf8");
assert.match(catalogRoute, /getGameinfoMarketPackSource[\s\S]*q\.get\("externalPackKey"\)/);
const marketChecksPage = readFileSync(new URL("../src/components/gameinfo-market-checks-page.js", import.meta.url), "utf8");
assert.match(marketChecksPage, /setConfirmMarket\(market\.key\)[\s\S]*DialogTitle>ยืนยัน Check ทั้ง/);
assert.match(marketChecksPage, /อัตโนมัติทุกวัน 09:00 น\. เวลาไทย/);
const instrumentation = readFileSync(new URL("../src/instrumentation.js", import.meta.url), "utf8");
assert.match(instrumentation, /NODE_ENV === "production"[\s\S]*startGameinfoMarketScheduler/);
const marketScheduler = readFileSync(new URL("../src/server/gameinfo-market-scheduler.js", import.meta.url), "utf8");
assert.match(marketScheduler, /nextGameinfoMarketRunAt[\s\S]*startGameinfoMarketCheck\(market\.key, null, "scheduled"\)/);
const oldHome = readFileSync(new URL("../src/components/gameinfo-home-page.js", import.meta.url), "utf8");
assert.match(oldHome, /if \(priceComparison\)[\s\S]*redirect\(`\/gameinfo\/\$\{lang\}\/pack-price-compare/);
const packRoute = readFileSync(new URL("../src/app/api/gameinfo/gamelist/[id]/packs/route.js", import.meta.url), "utf8");
assert.match(packRoute, /มีสูตรเดิมชื่อ \$\{column\.label\} กรุณาเปลี่ยนชื่อก่อนเปิด Market/);
const marketShell = readFileSync(new URL("../src/components/gameinfo-market-shell.js", import.meta.url), "utf8");
assert.match(marketShell, /<main[\s\S]*data-shadcn-focus/);
assert.match(marketShell, /seller-price-compare/);
const marketServer = readFileSync(new URL("../src/server/gameinfo-market-system.js", import.meta.url), "utf8");
assert.match(marketServer, /if \(!totalGames\)[\s\S]*ยังไม่มีเกมที่เปิด/);
assert.match(marketServer, /SELECT seller_name FROM gameinfo_market_own_sellers[\s\S]*fetchNormalizedGameinfoMarketCatalog\(run\.market, config\.external_game_key, config\.product_type, ownSellerNames\)/);
assert.match(marketServer, /requestedOrAll = allSellers \|\| includeCompetitors[\s\S]*selectGameinfoCompareSellerKeys/);
assert.match(marketServer, /ownOnly[\s\S]*own_offer\.seller_key = ANY\(\$6::text\[\]\)/);
assert.match(marketServer, /sellerKeys[\s\S]*own_offer\.seller_key = ANY\(\$8::text\[\]\)/);
assert.match(marketServer, /status === "mapped" \? "AND m\.status = 'active'"/);
assert.match(marketServer, /status === "stale" \? "" : "AND c\.active"/);
assert.match(marketServer, /COUNT\(\*\) FILTER \(WHERE m\.status = 'stale'\)/);
assert.match(marketServer, /WHERE m\.game_id = \$1[\s\S]*AND m\.status = 'active' AND c\.active/);
assert.match(marketServer, /getGameinfoMarketPackSource[\s\S]*gameinfo_market_offers[\s\S]*ORDER BY price, seller_name/);
assert.match(marketServer, /export async function deleteAllGameinfoMarketMappings[\s\S]*FOR UPDATE[\s\S]*'delete_all'/);
const mappingRoute = readFileSync(new URL("../src/app/api/gameinfo/market-mappings/route.js", import.meta.url), "utf8");
assert.match(mappingRoute, /input\?\.all === true[\s\S]*deleteAllGameinfoMarketMappings/);
const mappingPage = readFileSync(new URL("../src/components/gameinfo-market-mapping-page.js", import.meta.url), "utf8");
assert.equal((mappingPage.match(/gameinfo-mapping-color/g) || []).length, 2);
assert.match(mappingPage, /let ignore = false[\s\S]*if \(!ignore\) setWorkspace[\s\S]*return \(\) => \{ ignore = true; \}/);
assert.match(mappingPage, /pack\.price \?\? "—"/);
assert.match(ownComparePage, /let ignore = false[\s\S]*if \(!ignore\) setComparison[\s\S]*return \(\) => \{ ignore = true; \}/);
assert.match(ownComparePage, /setComparison\(null\)/);

assert.equal(gameinfoMarketPackDisplayName("[INSTANT] 【AUTO】60 Diamonds (Global)"), "60 Diamonds (Global)");
assert.equal(gameinfoMarketPackDisplayName("60 Diamonds"), "60 Diamonds");
assert.equal(gameinfoMarketPackDisplayName("[ONLY]"), "[ONLY]");
assert.equal(gameinfoMarketPackDisplayName(null), "");
assert.match(mappingPage, /gameinfoMarketPackDisplayName\(item\.name\)/);
assert.match(mappingPage, /max-w-\[18rem\] truncate/);
assert.match(mappingPage, /ราคาขายในเว็บ[\s\S]*marketPrice\(item\)/);
assert.match(marketServer, /LEFT JOIN LATERAL \([\s\S]*gameinfo_market_offers o[\s\S]*ORDER BY o\.price[\s\S]*LIMIT 1[\s\S]*\) own_price ON TRUE/);
assert.match(marketServer, /ownPriceClause = filterBySeller \? "AND o\.seller_key = ANY\(\$8::text\[\]\)"/);

console.log("\n54 passed, 0 failed");
