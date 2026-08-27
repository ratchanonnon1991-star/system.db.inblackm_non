import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { packCompareStorageKey, togglePackCompareColumn } from "@/lib/gameinfo-pack-market.js";
import {
  ITEMKU_GAMES,
  clearItemkuCache,
  convertItemkuSellerPriceToUsd,
  extractItemkuFlightText,
  fetchItemkuPage,
  groupItemkuOffers,
  itemkuGameUrl,
  normalizeItemkuGame,
  normalizeItemkuGroup,
  parseItemkuCatalogHtml,
  parseItemkuDenominationHtml,
  parseItemkuReaderJson,
} from "@/server/itemku-prices.js";

function flight(productListData, { escaped = false } = {}) {
  const chunk = `0:{"productListData":${JSON.stringify(productListData)}}`;
  const script = `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`;
  return escaped ? script.replaceAll("&", "&amp;") : script;
}

const catalogData = {
  market: { game_id: 257, item_type_id: 569 },
  selectedItemType: {
    name: "Top Up",
    item_info_group: [
      { id: 1, name: "Coin", item_info: [{ id: 11, name: "100 Coin", slug: "100-coin" }, { id: 12, name: "500 Coin", slug: "500-coin" }] },
      { id: 2, name: "Zem", item_info: [{ id: 21, name: "14 Zem", slug: "14-zem" }] },
    ],
  },
  foreignExchangeRate: { IDR: 500, THB: 1, USD: 0.03 },
};

assert.match(extractItemkuFlightText(flight(catalogData)), /productListData/);
assert.match(extractItemkuFlightText(flight(catalogData, { escaped: true })), /productListData/);
const catalog = parseItemkuCatalogHtml(flight(catalogData));
assert.deepEqual(catalog.groups.map(({ value, label }) => ({ value, label })), [{ value: "coin", label: "Coin" }, { value: "zem", label: "Zem" }]);
assert.equal(catalog.groups[0].denominations[1].id, "12");

const sellerPage = flight({
  foreignExchangeRate: { IDR: 500, THB: 1, USD: 0.03 },
  productDetail: { id: 101, item_info_id: 11, name: "100 Coin", seller_price: 15000, stock: 8, seller: { shop_name: "Topup_youthshop", rating: 4.9 }, seo_string: "zepeto-100-coin", sold: 20, delivery_time: "Instant" },
  products: [
    { id: 101, item_info_id: 11, seller_price: 15000, seller: { shop_name: "Topup_youthshop" } },
    { id: 102, item_info_id: 11, seller_price: 14000, seller: { shop_name: "SecondShop" }, sold_count: 7 },
    { id: 999, item_info_id: 12, seller_price: 100, seller: { shop_name: "WrongPack" } },
  ],
});
const parsed = parseItemkuDenominationHtml(sellerPage, { id: "11", name: "100 Coin", order: 0, sourceUrl: "https://www.itemku.com/en/g/zepeto/top-up/100-coin" });
assert.equal(parsed.offers.length, 2);
assert.equal(parsed.offers[0].currency, "USD");
assert.equal(parsed.offers[0].price.toFixed(2), "0.90");
assert.equal(parsed.offers[0].seller, "Topup_youthshop");
assert.equal(parsed.offers[0].productUrl, "https://www.itemku.com/en/g/zepeto/top-up/100-coin?product_id=101");
assert.equal(parsed.offers[1].sold, 7);
assert.equal(groupItemkuOffers(parsed.offers).length, 1);
assert.equal(convertItemkuSellerPriceToUsd(14810, { IDR: 533.9475950738916, THB: 1, USD: 0.0296 }).toFixed(6), "0.821009");
assert.throws(() => convertItemkuSellerPriceToUsd(1000, { IDR: 0, USD: 0.03 }), /อัตราแลกเปลี่ยน/);
assert.throws(() => parseItemkuDenominationHtml(flight({ products: [{ id: 1, item_info_id: 11, seller_price: 10, seller: { shop_name: "A" } }] }), { id: 11, name: "Pack" }), /อัตราแลกเปลี่ยน/);
assert.deepEqual(parseItemkuReaderJson('<html><body><pre>{&quot;success&quot;:true,&quot;data&quot;:{&quot;total_item&quot;:2}}</pre></body></html>'), { success: true, data: { total_item: 2 } });
assert.equal(packCompareStorageKey("hidden-columns", "kaleoz", "zepeto"), "gameinfo:kaleoz-hidden-columns:zepeto");
assert.deepEqual(togglePackCompareColumn(["seller:A"], "seller:A"), []);
assert.deepEqual(togglePackCompareColumn([], "seller:A"), ["seller:A"]);

assert.deepEqual(ITEMKU_GAMES.map((game) => game.slug), ["zepeto", "honkai-impact-3", "love-and-deepspace", "harry-potter-magic-awakened"]);
assert.equal(normalizeItemkuGame("love-and-deepspace").label, "LOVE AND DEEPSPACE");
assert.equal(normalizeItemkuGame("unknown").value, "zepeto");
assert.equal(normalizeItemkuGroup(null), "all");
assert.equal(itemkuGameUrl("zepeto"), "https://www.itemku.com/en/g/zepeto/top-up");

clearItemkuCache();
let failed = false;
const fetchHtml = async (url) => {
  if (failed) throw new Error("offline");
  return url.endsWith("/top-up") ? flight(catalogData) : sellerPage;
};
const loaded = await fetchItemkuPage("zepeto", "coin", { fetchHtml, fetchJson: null });
assert.equal(loaded.provider, "itemku");
assert.equal(loaded.defaultBaselineSeller, undefined);
assert.equal(loaded.productType, "coin");
assert.equal(loaded.groups.length, 2);
failed = true;
assert.equal(await fetchItemkuPage("zepeto", "coin", { force: true, fetchHtml, fetchJson: null }), loaded);

clearItemkuCache();
let apiUrl = "";
const apiLoaded = await fetchItemkuPage("zepeto", "zem", {
  fetchHtml: async (url) => url.endsWith("/top-up") ? flight(catalogData) : sellerPage,
  fetchJson: async (url) => {
    apiUrl = url;
    return { data: { total_item: 2, data: [
      { id: 201, item_info_id: 21, seller_price: 16000, seller: { shop_name: "Topup_youthshop", average_rating: 4.95 }, stock: 3 },
      { id: 202, item_info_id: 21, seller_price: 14000, seller: { shop_name: "AnotherShop" }, order_record: { successful_order_count: 9 } },
    ] } };
  },
});
assert.equal(apiLoaded.offers.length, 2);
assert.match(apiUrl, /api-gateway\.itemku\.com\/v1\/product[\s\S]*per_page=100[\s\S]*game_id=257[\s\S]*item_type_id=569/);
assert.equal(apiLoaded.offers[0].productUrl, "https://www.itemku.com/en/g/zepeto/top-up/14-zem?product_id=201");

const route = readFileSync(new URL("../src/app/api/gameinfo/itemku-prices/route.js", import.meta.url), "utf8");
assert.match(route, /requireGameinfoAccess/);
assert.match(route, /searchParams\.get\("refresh"\) === "1"/);
assert.match(route, /fetchItemkuPage/);

const compare = readFileSync(new URL("../src/components/gameinfo-pack-price-compare.js", import.meta.url), "utf8");
assert.match(compare, /TabsTrigger value="kaleoz"[\s\S]*TabsTrigger value="itemku"/);
assert.match(compare, /next\.set\("market", value\)[\s\S]*next\.delete\("game"\)[\s\S]*next\.delete\("unit"\)/);
assert.match(compare, /storageKey\("seller-order", provider, currentGame\)/);
assert.match(compare, /editable && provider === "kaleoz"/);
assert.match(compare, /provider === "itemku" \? `Sold:/);

const runner = readFileSync(new URL("../src/server/itemku-prices.js", import.meta.url), "utf8");
assert.match(runner, /response\.status === 403[\s\S]*itemkuReaderUrl\(url\)[\s\S]*x-return-format/);
assert.match(runner, /searchParams\.append\("country_codes\[\]", "TH"\)/);

console.log("\n45 passed");
