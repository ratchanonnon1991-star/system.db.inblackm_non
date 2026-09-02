import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GAMEINFO_COMPARE_PAGE_SIZE,
  GAMEINFO_COMPARE_SELLER_LIMIT,
  calculateGameinfoPriceDifference,
  buildGameinfoOrderedMappingDraft,
  gameinfoMappingViewModes,
  gameinfoMarketGameLabel,
  gameinfoMarketPackDisplayName,
  normalizeGameinfoMappingViewMode,
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
assert.equal(marketPackIdentity("g2g", { key: "dataset-128", name: "เปลี่ยนชื่อได้" }), "g2g:dataset-128");
assert.equal(calculateGameinfoPriceDifference(100, 95.13).alert, false);
assert.equal(calculateGameinfoPriceDifference(100, 95.12).alert, true);
assert.equal(calculateGameinfoPriceDifference(100, 105.12).alert, false);
assert.equal(calculateGameinfoPriceDifference(100, 105.13).alert, true);
assert.equal(
  calculateGameinfoPriceDifference(100, 110).percent,
  calculateGameinfoPriceDifference(110, 100).percent
);
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
assert.match(marketChecksPage, /setConfirmMarket\(market\.key\)[\s\S]*ยืนยัน Check ทั้ง \$\{confirmMarketConfig/);
assert.match(marketChecksPage, /อัตโนมัติทุกวัน 09:00 น\. เวลาไทย/);
assert.match(marketChecksPage, /GAMEINFO_MARKETS[\s\S]*const MARKETS = GAMEINFO_MARKETS/);
assert.match(marketChecksPage, /const AUTO_SCHEDULE_NOTE = "อัตโนมัติทุกวัน 09:00 น\. เวลาไทย"/);
assert.match(marketChecksPage, /ไม่มี cooldown · \{AUTO_SCHEDULE_NOTE\}/);
// One button starts every startable market at once through the same endpoint.
assert.match(marketChecksPage, /const ALL_MARKETS = "all"/);
assert.match(marketChecksPage, /const startableMarkets = MARKETS\.filter\([\s\S]*enabledCounts\[market\.key\] \|\| 0\) > 0 && !\(runs\[market\.key\] && !FINISHED\.has/);
assert.match(marketChecksPage, /const targets = market === ALL_MARKETS \? startableMarkets\.map\(\(item\) => item\.key\) : \[market\]/);
assert.match(marketChecksPage, /onClick=\{\(\) => setConfirmMarket\(ALL_MARKETS\)\}[\s\S]*รีดึงราคาทุก Market<\/Button>/);
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
assert.match(marketServer, /resolveActiveAlertsForMappingChange[\s\S]*WITH resolved AS[\s\S]*status = 'resolved'[\s\S]*gameinfo_price_alert_events/);
assert.match(marketServer, /reason: current\.rows\[0\] \? "mapping_changed" : "mapping_created"/);
assert.match(marketServer, /reason: "mapping_created_ordered"/);
assert.match(marketServer, /export async function deleteGameinfoMarketMapping[\s\S]*reason: "mapping_deleted"[\s\S]*DELETE FROM gameinfo_market_mappings/);
assert.match(marketServer, /export async function deleteAllGameinfoMarketMappings[\s\S]*reason: "all_mappings_deleted"[\s\S]*DELETE FROM gameinfo_market_mappings/);
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
assert.match(mappingPage, /<TooltipContent className="max-w-80 break-words">\{fullName\}<\/TooltipContent>/);
assert.doesNotMatch(mappingPage, /title=\{/);
assert.match(mappingPage, /<PackNameCell className="max-w-\[18rem\] font-medium" fullName=\{item\.name\}>/);
assert.match(mappingPage, /<CardTitle>จัดการ Mapping ทั้งชุด<\/CardTitle>[\s\S]*ลิงก์ตามลำดับ[\s\S]*ล้าง Mapping[\s\S]*<\/Card>[\s\S]*xl:grid-cols-2/);
assert.match(mappingPage, /visiblePacks\.map\(\(pack\)/);
assert.match(mappingPage, /value=\{packQuery\}[\s\S]*value=\{packStatus\}/);
assert.equal((mappingPage.match(/className="h-16"/g) || []).length, 2);
assert.match(marketServer, /ALTER TABLE gameinfo_market_catalog_packs ADD COLUMN IF NOT EXISTS product_type/);
assert.match(marketServer, /ALTER TABLE gameinfo_market_own_sellers[\s\S]*DROP CONSTRAINT IF EXISTS gameinfo_market_own_sellers_market_check[\s\S]*ADD CONSTRAINT gameinfo_market_own_sellers_market_check[\s\S]*'g2g'/);
assert.match(marketServer, /UPDATE gameinfo_market_catalog_packs SET active = FALSE[\s\S]*AND product_type IN \(\$3, ''\)/);
assert.match(marketServer, /DELETE FROM gameinfo_market_offers o[\s\S]*c\.product_type IN \(\$3, ''\)/);
assert.match(marketServer, /FROM gameinfo_market_mappings om[\s\S]*om\.data_mode <> \$4[\s\S]*\) other_mode ON TRUE/);
assert.match(mappingPage, /item\.otherModePackId \? <Badge variant="secondary">โหมด \{MODE_LABELS\[item\.otherMode\]/);
assert.deepEqual(gameinfoMappingViewModes("all"), ["uid", "idpass"]);
assert.deepEqual(gameinfoMappingViewModes("idpass"), ["idpass"]);
assert.deepEqual(gameinfoMappingViewModes("nonsense"), ["uid"]);
assert.equal(normalizeGameinfoMappingViewMode("all"), "all");
assert.equal(normalizeGameinfoMappingViewMode(""), "uid");
assert.match(marketServer, /const mappingModeClause = allModes \? "" : "AND mm\.data_mode = \$4"/);
assert.match(marketServer, /ORDER BY \(mm\.data_mode = \$4\) DESC, mm\.updated_at DESC/);
assert.match(marketServer, /externalGameKeyConflict: configuredKeys\.length > 1 \? configuredKeys : \[\]/);
assert.match(marketServer, /packs: perMode\.flatMap\(\(item\) => item\.packs\)/);
assert.match(mappingPage, /<TabsTrigger value="all">รวม<\/TabsTrigger><TabsTrigger value="uid">UID<\/TabsTrigger><TabsTrigger value="idpass">ID\/PASS<\/TabsTrigger>/);
// Both tab groups share one row so the two cards' headers stay the same height.
assert.match(mappingPage, /<div className="flex flex-wrap items-center gap-2">[\s\S]*value=\{packMode\}[\s\S]*value=\{packStatus\}[\s\S]*<\/div>/);
assert.match(mappingPage, /dataMode: selectedPack\.dataMode, market, packId: selectedPack\.id/);
assert.match(mappingPage, /disabled=\{packMode === "all" \|\| !orderedMappingDraft\.packs\.length/);
assert.doesNotMatch(mappingPage, /selectedPackId/);
assert.match(mappingPage, /ราคาขายในเว็บ[\s\S]*marketPrice\(item\)/);
assert.match(marketServer, /LEFT JOIN LATERAL \([\s\S]*gameinfo_market_offers o[\s\S]*ORDER BY o\.price[\s\S]*LIMIT 1[\s\S]*\) own_price ON TRUE/);
assert.match(marketServer, /ownPriceClause = filterBySeller \? "AND o\.seller_key = ANY\(\$8::text\[\]\)"/);

assert.match(schema, /product_type text NOT NULL DEFAULT ''/);
assert.equal(gameinfoMarketGameLabel("Honkai Impact 3 (SEA) · South East Asia · Multi-Platform"), "Honkai Impact 3 (SEA) · SEA · Multi-Platform");
assert.equal(gameinfoMarketGameLabel(null), "");
const marketManager = readFileSync(new URL("../src/components/gameinfo-market-manager.js", import.meta.url), "utf8");
// A market's price is a link to a column the game already has, not a column
// the market creates. A game mapped before linking existed has no key and
// still resolves the old market-kind column, so both paths are asserted.
assert.match(marketManager, /market\.priceColumnKey \? Boolean\(column\) : column\?\.enabled === true/);
assert.match(marketManager, /return market\.priceColumnKey \|\| marketColumns\.get\(market\.market\)\?\.key \|\| ""/);
assert.match(marketManager, /async function linkColumn\(current, columnKey\)/);
assert.match(schema, /price_column_key varchar\(64\) NOT NULL DEFAULT ''/);
assert.match(marketManager, /<FieldContent className="min-w-0">/);
assert.match(marketManager, /<SelectTrigger className="w-full min-w-0 overflow-hidden"><SelectValue className="truncate"/);
assert.match(marketManager, /label: gameinfoMarketGameLabel\(game\.label\)/);

assert.match(marketServer, /getGameinfoExchangeRates\([\s\S]*\{ at: referenceAt, includeHistory: false, refreshStale: false \}/);
assert.match(marketServer, /const \[availableResult, mappings\] = await Promise\.all\(/);
assert.match(marketServer, /export async function unacknowledgeGameinfoPriceAlert[\s\S]*acknowledged_by = NULL[\s\S]*acknowledged_at = NULL[\s\S]*note = ''/);
assert.doesNotMatch(marketServer, /unacknowledgeGameinfoPriceAlert[\s\S]*note = NULL/);
const priceAlertsRoute = readFileSync(new URL("../src/app/api/gameinfo/price-alerts/route.js", import.meta.url), "utf8");
assert.match(priceAlertsRoute, /body\.action === "unacknowledge"[\s\S]*unacknowledgeGameinfoPriceAlert/);
const priceAlertsPage = readFileSync(new URL("../src/components/gameinfo-price-alerts-page.js", import.meta.url), "utf8");
assert.match(priceAlertsPage, /item\.acknowledgedAt \? "ยกเลิก" : "รับทราบ"/);
assert.match(priceAlertsPage, /<Badge variant="success"><Check \/>รับทราบแล้ว<\/Badge>/);
const rateServer = readFileSync(new URL("../src/server/gameinfo-exchange-rates.js", import.meta.url), "utf8");
assert.match(rateServer, /if \(!referenceAt && \(force \|\| \(refreshStale && current\.stale\)\)\)/);
assert.match(rateServer, /if \(!includeHistory\) return \{ pair, \.\.\.current, referenceAt: referenceAt\?\.toISOString\(\) \|\| null, history: \[\] \};/);


// A price edit in GameInfo changes one half of every alert for that game, so
// the alerts are recomputed from the offers already stored: no market call,
// no check run, and the run ids on the row keep whatever the last run left.
assert.match(marketServer, /export async function recalculateGameinfoPriceAlerts\(\{ market = "", gameId = 0, dataMode = "" \} = \{\}\)/);
assert.match(marketServer, /recalculateGameinfoPriceAlerts[\s\S]*evaluateAlertsForConfig\(client, null, config\)/);
assert.doesNotMatch(marketServer, /recalculateGameinfoPriceAlerts[\s\S]{0,1200}fetchNormalizedGameinfoMarketCatalog/);
assert.match(marketServer, /last_seen_run_id = COALESCE\(EXCLUDED\.last_seen_run_id, gameinfo_price_alerts\.last_seen_run_id\)/);
assert.match(marketServer, /ALTER TABLE gameinfo_price_alerts ALTER COLUMN first_seen_run_id DROP NOT NULL/);
assert.match(schema, /first_seen_run_id bigint,/);
assert.match(priceAlertsRoute, /export async function POST\(request\)[\s\S]*requireGameinfoMarketChecker[\s\S]*recalculateGameinfoPriceAlerts/);
assert.match(priceAlertsPage, /onClick=\{refreshAlerts\}/);
assert.match(priceAlertsPage, /canAcknowledge \? "คำนวณ Alert ใหม่" : "โหลดใหม่"/);
const packsRoute = readFileSync(new URL("../src/app/api/gameinfo/gamelist/[id]/packs/route.js", import.meta.url), "utf8");
assert.match(packsRoute, /await refreshAlertsAfterSave\(gameId, mode\);\s*return jsonOk\(\{ game: \{ id: gameId, \.\.\.data\.packs/);
assert.match(packsRoute, /await refreshAlertsAfterSave\(gameId, mode\);\s*return jsonOk\(\{ game: \{ id: gameId, \.\.\.packs \} \}\)/);
// A failed recalculation must not fail a save whose prices are already stored.
assert.match(packsRoute, /async function refreshAlertsAfterSave[\s\S]*try \{[\s\S]*\} catch \(error\) \{[\s\S]*console\.error/);

console.log("\n117 passed, 0 failed");
