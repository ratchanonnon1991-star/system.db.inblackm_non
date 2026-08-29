import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cappedSellerColumns, packCompareStorageKey, togglePackCompareColumn } from "@/lib/gameinfo-pack-market.js";
import { slugFromItemkuUrl } from "@/server/itemku-games-repository.js";
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
  inspectItemkuGame,
  parseItemkuCatalogHtml,
  parseItemkuGameLabel,
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
assert.match(compare, /await submitGameList\(`\/api\/gameinfo\/\$\{provider\}-games`/);
assert.match(compare, /await submitGameList\(`\/api\/gameinfo\/\$\{provider\}-games\?game=\$\{encodeURIComponent\(game\.value\)\}`/);
assert.match(compare, /const marketGameUrl = provider === "itemku" \? ITEMKU_GAME_URL : KALEOZ_GAME_URL;/);
assert.match(compare, /provider === "itemku" \? `Sold:/);

// itemku hands back hundreds of shops, so the table opens with a capped set of
// seller columns instead of one per shop.
const coverage = new Map([["a", 9], ["b", 8], ["c", 7], ["d", 1], ["e", 0]]);
assert.deepEqual(cappedSellerColumns(["a", "b", "c"], coverage, 3, "a"), []);
assert.deepEqual(cappedSellerColumns(["a", "b", "c", "d", "e"], coverage, 3, "a"), ["seller:d", "seller:e"]);
// The reference seller is kept even when its coverage puts it outside the cap.
assert.deepEqual(cappedSellerColumns(["a", "b", "c", "d", "e"], coverage, 3, "e"), ["seller:d"]);
// Hidden keys keep the order the columns are in, not the ranking order.
assert.deepEqual(cappedSellerColumns(["e", "d", "c", "b", "a"], coverage, 2, ""), ["seller:e", "seller:d", "seller:c"]);

// Picking a reference seller is preview-only and must not persist or reorder columns.
assert.match(compare, /function selectBaselineSeller\(seller\)[\s\S]*setBaselineSeller\(seller\)/);
assert.doesNotMatch(compare, /const nextOrder = \[seller, \.\.\.sellers\.filter\(\(item\) => item !== seller\)\]/);
// dnd-kit's counter-based aria-describedby tears hydration down if it ships.
assert.match(compare, /"aria-describedby": describedBy, \.\.\.dragAttributes \} = attributes/);
// itemku games are added by link, the same way Kaleoz games are.
assert.equal(slugFromItemkuUrl("https://www.itemku.com/en/g/honkai-star-rail/top-up"), "honkai-star-rail");
assert.equal(slugFromItemkuUrl("https://www.itemku.com/g/zepeto"), "zepeto");
assert.equal(slugFromItemkuUrl("Mobile-Legends"), "mobile-legends");
assert.throws(() => slugFromItemkuUrl("https://www.kaleoz.com/buy/zepeto"), /ลิงก์ไม่ถูกต้อง/);
assert.throws(() => slugFromItemkuUrl(""), /กรุณาวางลิงก์/);

// The name comes from the Flight payload, then the title, then the slug.
assert.equal(parseItemkuGameLabel(flight({ ...catalogData, game: { slug: "zepeto", name: "ZEPETO" } }), "zepeto"), "ZEPETO");
assert.equal(parseItemkuGameLabel("<html><head><title>Top Up Honkai Star Rail | itemku</title></head></html>", "honkai-star-rail"), "Honkai Star Rail");
assert.equal(parseItemkuGameLabel("<html></html>", "love-and-deepspace"), "LOVE AND DEEPSPACE");

const inspected = await inspectItemkuGame("zepeto", { fetchHtml: async () => flight({ ...catalogData, game: { slug: "zepeto", name: "ZEPETO" } }) });
assert.deepEqual(inspected, { slug: "zepeto", label: "ZEPETO" });
// A page with no Top Up section is rejected before it can be saved.
await assert.rejects(inspectItemkuGame("nope", { fetchHtml: async () => "<html></html>" }), /Flight payload/);

const itemkuGamesRoute = readFileSync(new URL("../src/app/api/gameinfo/itemku-games/route.js", import.meta.url), "utf8");
assert.match(itemkuGamesRoute, /requireGameinfoEditor/);
assert.match(itemkuGamesRoute, /slugFromItemkuUrl\(body\.url\)/);
assert.match(itemkuGamesRoute, /inspectItemkuGame\(slug\)/);
assert.match(itemkuGamesRoute, /export async function DELETE/);

const itemkuGamesRepo = readFileSync(new URL("../src/server/itemku-games-repository.js", import.meta.url), "utf8");
assert.match(itemkuGamesRepo, /CREATE TABLE IF NOT EXISTS itemku_games/);
assert.match(itemkuGamesRepo, /INSERT INTO itemku_games \(value, slug, label, sort_order\)/);

// Seller columns are fixed boxes, and the table sizes to them so a short set of
// columns packs to the left instead of stretching across the card.
assert.match(compare, /<Table className="w-auto table-fixed"/);
assert.match(compare, /cn\("sticky top-0 z-20 h-12 w-48 cursor-grab touch-none bg-card px-3 text-right active:cursor-grabbing"/);
assert.doesNotMatch(compare, /min-w-\[980px\]/);

// Portalled popups escape the page wrapper, so they opt out of the legacy red
// focus outline themselves or it stacks on top of the shadcn ring.
const dropdownMenuUi = readFileSync(new URL("../src/components/ui/dropdown-menu.jsx", import.meta.url), "utf8");
const selectUi = readFileSync(new URL("../src/components/ui/select.jsx", import.meta.url), "utf8");
const dialogUi = readFileSync(new URL("../src/components/ui/dialog.jsx", import.meta.url), "utf8");
const tooltipUi = readFileSync(new URL("../src/components/ui/tooltip.jsx", import.meta.url), "utf8");
assert.match(dropdownMenuUi, /data-slot="dropdown-menu-content"\s+data-shadcn-focus/);
assert.match(selectUi, /data-slot="select-content"[\s\S]{0,80}?data-shadcn-focus/);
assert.match(dialogUi, /data-slot="dialog-content"\s+data-shadcn-focus/);
assert.match(tooltipUi, /data-slot="tooltip-content"\s+data-shadcn-focus/);

// The bulk actions sit at the top of the menu, and "clear" touches sellers only.
assert.match(compare, /<DropdownMenuContent[^>]*>\s*<div className="flex gap-1 p-1">\s*<Button[^>]*onClick=\{showAllColumns\}>แสดงทุกคอลัมน์<\/Button>\s*<Button[^>]*onClick=\{clearSellerColumns\}>ล้าง Seller<\/Button>/);
assert.match(compare, /effectiveHiddenColumns\.filter\(\(column\) => !column\.startsWith\("seller:"\)\),\s*\.\.\.sellers\.map\(\(seller\) => `seller:\$\{seller\}`\),/);
// The configured own shop is the default; changing it on this page is preview-only.
assert.doesNotMatch(compare, /defaultBaselineSeller/);
assert.match(compare, /const savedBaselineSeller = serverPage\?\.baselineSeller \|\| ""/);
assert.doesNotMatch(compare, /saveBaselinePreference|clearBaselineSeller/);

const preferenceRoute = readFileSync(new URL("../src/app/api/gameinfo/market-preference/route.js", import.meta.url), "utf8");
assert.match(preferenceRoute, /export async function DELETE\(request\)/);
assert.match(preferenceRoute, /clearGameinfoBaselineSeller\(user\.id, body\.provider, body\.game\)/);

const preferences = readFileSync(new URL("../src/server/gameinfo-market-preferences.js", import.meta.url), "utf8");
assert.match(preferences, /DELETE FROM gameinfo_market_preferences WHERE user_id = \$1 AND provider = \$2 AND game = \$3/);

// Drag-to-select paints rows on pointerenter and drops the click that ends the drag.
assert.match(compare, /onPointerDown=\{\(\) => startColumnPaint\(`seller:\$\{seller\}`\)\}/);
assert.match(compare, /onPointerEnter=\{\(event\) => paintColumn\(`seller:\$\{seller\}`, event\)\}/);
assert.match(compare, /if \(paintHiddenRef\.current === null \|\| !event\.buttons\) return;/);
assert.match(compare, /if \(skipNextCheckedChangeRef\.current\) \{\s*skipNextCheckedChangeRef\.current = false;\s*return;/);
// The price filter narrows the seller columns but always keeps the reference one.
assert.match(compare, /if \(priceFilter === "all" \|\| seller === activeBaselineSeller\) return true;/);
assert.match(compare, /sellerPriceSides\.get\(seller\)\?\.\[priceFilter\] \|\| 0\) > 0/);
assert.match(compare, /<TabsTrigger value="expensive">แพงกว่า<\/TabsTrigger>\s*<TabsTrigger value="cheaper">ถูกกว่า<\/TabsTrigger>/);
// More expensive than the reference reads green, cheaper stays red.
assert.match(compare, /difference > 0 && "font-semibold text-emerald-600 dark:text-emerald-400"/);
assert.match(compare, /\(isCheapest \|\| difference < 0\) && "font-semibold text-destructive"/);
// base-ui throws when a GroupLabel renders outside a Group.
assert.doesNotMatch(compare, /<DropdownMenuContent[^>]*>\s*<DropdownMenuLabel>/);
assert.match(compare, /<DropdownMenuGroup>\s*<DropdownMenuLabel>คอลัมน์สรุป<\/DropdownMenuLabel>/);

const runner = readFileSync(new URL("../src/server/itemku-prices.js", import.meta.url), "utf8");
assert.match(runner, /response\.status === 403[\s\S]*itemkuReaderUrl\(url\)[\s\S]*x-return-format/);
assert.match(runner, /searchParams\.append\("country_codes\[\]", "TH"\)/);

console.log("\n89 passed");
