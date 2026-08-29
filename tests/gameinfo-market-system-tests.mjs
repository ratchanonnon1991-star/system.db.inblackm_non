import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GAMEINFO_COMPARE_PAGE_SIZE,
  GAMEINFO_COMPARE_SELLER_LIMIT,
  calculateGameinfoPriceDifference,
  buildGameinfoOrderedMappingDraft,
  marketPackIdentity,
  nextGameinfoMarketRunAt,
  normalizeMarketPage,
  reconcileGameinfoPackMappingTargets,
} from "@/lib/gameinfo-market-system.js";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer.js";
import { gameinfoDistinctColorStyleMap } from "@/lib/gameinfo-stable-color.js";
import { buildGameinfoMarketPackPriceMap } from "@/lib/gameinfo-market-prices.js";

assert.equal(marketPackIdentity("kaleoz", { name: "  128 ZEMS ", category: "Coins", amount: 128 }), "kaleoz:128 zems|coins|128");
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
const ambiguous = normalizeMarketPage("kaleoz", { game: "zepeto", productType: "coins", groups: [{ packLabel: "128 Zem", quantity: 128 }, { packLabel: "128 Zem", quantity: 128 }] });
assert.equal(ambiguous.packs.length, 0);
assert.equal(ambiguous.ambiguities.length, 1);
assert.equal(GAMEINFO_COMPARE_PAGE_SIZE, 50);
assert.equal(GAMEINFO_COMPARE_SELLER_LIMIT, 12);
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
const oldHome = readFileSync(new URL("../src/components/gameinfo-home-page.js", import.meta.url), "utf8");
assert.match(oldHome, /if \(priceComparison\)[\s\S]*redirect\(`\/gameinfo\/\$\{lang\}\/pack-price-compare/);
const packRoute = readFileSync(new URL("../src/app/api/gameinfo/gamelist/[id]/packs/route.js", import.meta.url), "utf8");
assert.match(packRoute, /มีสูตรเดิมชื่อ \$\{column\.label\} กรุณาเปลี่ยนชื่อก่อนเปิด Market/);
const marketShell = readFileSync(new URL("../src/components/gameinfo-market-shell.js", import.meta.url), "utf8");
assert.match(marketShell, /<main[\s\S]*data-shadcn-focus/);
const marketServer = readFileSync(new URL("../src/server/gameinfo-market-system.js", import.meta.url), "utf8");
assert.match(marketServer, /if \(!totalGames\)[\s\S]*ยังไม่มีเกมที่เปิด/);
assert.match(marketServer, /export async function deleteAllGameinfoMarketMappings[\s\S]*FOR UPDATE[\s\S]*'delete_all'/);
const mappingRoute = readFileSync(new URL("../src/app/api/gameinfo/market-mappings/route.js", import.meta.url), "utf8");
assert.match(mappingRoute, /input\?\.all === true[\s\S]*deleteAllGameinfoMarketMappings/);
const mappingPage = readFileSync(new URL("../src/components/gameinfo-market-mapping-page.js", import.meta.url), "utf8");
assert.equal((mappingPage.match(/gameinfo-mapping-color/g) || []).length, 2);

console.log("\n32 passed, 0 failed");
