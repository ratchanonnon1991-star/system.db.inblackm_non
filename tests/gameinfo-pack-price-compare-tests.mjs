import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extractZepetoPackQuantity,
  groupKaleozZepetoOffers,
  kaleozGameUrl,
  normalizeKaleozGame,
  normalizeKaleozCategoryLabels,
  normalizeKaleozProductType,
  parseKaleozGameCatalogHtml,
  parseKaleozGameLabel,
  parseKaleozZepetoHtml,
} from "@/server/kaleoz-zepeto.js";

assert.equal(extractZepetoPackQuantity("Zepeto (GL) - 256 Zem (128 x 2 Zem)"), 256);
assert.equal(extractZepetoPackQuantity("Zepeto(Global) - 1k ZEMS"), 1000);
assert.equal(normalizeKaleozProductType("coins"), "coins");
assert.equal(normalizeKaleozProductType("invalid"), "invalid");
assert.equal(normalizeKaleozProductType(null), undefined);
const savedGames = [
  { value: "zepeto", slug: "zepeto", label: "ZEPETO" },
  { value: "honkai-star-rail", slug: "honkai-star-rail", label: "Honkai: Star Rail" },
];
assert.equal(normalizeKaleozGame("honkai-star-rail", savedGames).slug, "honkai-star-rail");
assert.equal(normalizeKaleozGame("world-war-heroes", savedGames).value, "zepeto");
assert.equal(kaleozGameUrl("mobile-legends"), "https://www.kaleoz.com/buy/mobile-legends?page=1");

const normalizedCachedPage = normalizeKaleozCategoryLabels({
  productType: "all",
  productTypeLabel: "All Properties",
  productTypes: [
    { value: "all", label: "All Properties" },
    { value: "coins", label: "Coins" },
  ],
});
assert.equal(normalizedCachedPage.productTypeLabel, "ทุกหมวดหมู่");
assert.deepEqual(normalizedCachedPage.productTypes, [
  { value: "all", label: "ทุกหมวดหมู่" },
  { value: "coins", label: "Coins" },
]);

const catalog = parseKaleozGameCatalogHtml(`<div id="item_property"><div class="property"><h3>Category</h3><select name="prop[776]"><option value="0">All Properties</option><option value="8774">Oneiric Shards</option><option value="8775">Supply Pass</option></select></div></div></div></div><script>window.clientData = {"game_id":779,"category_id":1182};</script>`);
assert.deepEqual(catalog, {
  gameLabel: "",
  gameId: "779",
  categoryId: "1182",
  propertyName: "prop[776]",
  propertyLabel: "Category",
  options: [
    { value: "0", label: "All Properties" },
    { value: "8774", label: "Oneiric Shards" },
    { value: "8775", label: "Supply Pass" },
  ],
});

const html = `<div class="item_list" data-item-count="199">
<div class="unit" data-stock="8091" data-item-promotion="1"><div class="cell tit" eventlabel="Zepeto (GL) - 128 Zem (64 + 64)" itemId="1" price="153.5" currency="THB" sellerName="InblackmTH"><img class="ItemPic" data-original="https://img/1.jpg"><dd>Server: Global</dd><li class="unitprice">฿ 1.00 = 1</li><li class="stock">Stock: 8.091k</li><li class="trade">Trading volume: 9370</li><div class="user-level"><span>Elite Power Seller</span></div></div>
<div class="unit" data-stock="9985" data-item-promotion="0"><div class="cell tit" eventlabel="Zepeto(Global) - 128 ZEMS" itemId="2" price="153.49" currency="THB" sellerName="TGSTopup"><li class="trade">Trading volume: 1536</li></div>`;
const parsed = parseKaleozZepetoHtml(html);
assert.equal(parsed.totalListings, 199);
assert.equal(parsed.offers.length, 2);
assert.deepEqual(parsed.offers[0], {
  itemId: "1",
  title: "Zepeto (GL) - 128 Zem (64 + 64)",
  quantity: 128,
  price: 153.5,
  currency: "THB",
  seller: "InblackmTH",
  sellerLevel: "Elite Power Seller",
  imageUrl: "https://img/1.jpg",
  productUrl: "https://www.kaleoz.com/buy/zepeto/1",
  server: "Global",
  stock: 8091,
  stockText: "8.091k",
  tradingVolume: 9370,
  unitPrice: "฿ 1.00 = 1",
  promo: true,
});
const groups = groupKaleozZepetoOffers(parsed.offers);
assert.equal(groups.length, 1);
assert.equal(groups[0].offers[0].seller, "TGSTopup");
assert.equal(groups[0].stock, 18076);

const cards = readFileSync(new URL("../src/components/gameinfo-gamelist-cards.js", import.meta.url), "utf8");
const compare = readFileSync(new URL("../src/components/gameinfo-pack-price-compare.js", import.meta.url), "utf8");
const globals = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
assert.match(cards, /Game Bot Auto[\s\S]*เทียบราคาแพ็ค/);
assert.match(compare, /ชื่อ Pack[\s\S]*visibleSellers\.map[\s\S]*ราคาต่ำสุด[\s\S]*ราคาแพงสุด[\s\S]*ดูรายการ/);
assert.match(compare, /isCheapest[\s\S]*text-destructive/);
assert.match(compare, /storageKey\("seller-order"/);
assert.match(compare, /DndContext[\s\S]*SortableSellerHeader/);
assert.match(compare, /Seller อ้างอิง[\s\S]*SellerPriceCell/);
assert.match(compare, /TooltipContent[\s\S]*offer\.unitPrice[\s\S]*Stock:[\s\S]*Trading volume:/);
assert.match(compare, /TooltipProvider[\s\S]*TooltipTrigger[\s\S]*TooltipContent/);
assert.match(compare, /function gameLabel\(value\)[\s\S]*gameinfoMarketGameLabel\(value\)[\s\S]*gameItems\(gameList\)/);
assert.match(compare, /Select items=\{sellerItems\}[\s\S]*selectBaselineSeller/);
assert.doesNotMatch(compare, /Topup_youthshop/);
assert.doesNotMatch(compare, /storageKey\("baseline-seller"/);
assert.match(compare, /availableSellers\.includes\(baselineSeller\) \? baselineSeller : ""/);
assert.doesNotMatch(compare, /\/api\/gameinfo\/market-preference|saveBaselinePreference/);
assert.match(compare, /ค่าเริ่มต้นจากร้านของเรา[\s\S]*เลือกเพื่อดูชั่วคราว ระบบจะไม่บันทึกค่านี้/);
assert.match(compare, /ArrowDown[\s\S]*ถูกกว่า[\s\S]*ArrowUp[\s\S]*แพงกว่า/);
assert.match(compare, /page\?\.productTypes[\s\S]*หมวดหมู่/);
assert.match(compare, /selectItems\(page\?\.productTypes\)\.map\(\(type, index\) => index === 0 \? \{ \.\.\.type, label: "ทุกหมวดหมู่" \}/);
assert.match(compare, /storageKey\("hidden-columns"/);
assert.match(compare, /เลือกคอลัมน์/);
assert.match(compare, /DropdownMenu[\s\S]*DropdownMenuCheckboxItem[\s\S]*showAllColumns/);
assert.match(compare, /visibleSellers[\s\S]*showCheapest[\s\S]*showMostExpensive[\s\S]*showDetails/);
assert.match(compare, /msUntilNextDailyRefresh[\s\S]*อัปเดต[\s\S]*รีเฟรชราคา/);
assert.match(compare, /page\?\.games[\s\S]*selectGame[\s\S]*>เกม</);
assert.match(compare, /storageKey[\s\S]*currentGame/);
assert.match(compare, /cellTone[\s\S]*bg-destructive\/5[\s\S]*bg-muted\/60[\s\S]*bg-muted\/20/);
assert.match(compare, /ไม่มีราคาอ้างอิง/);
assert.match(compare, /title = "เทียบราคาแพ็ค"/);
assert.match(compare, /<h1[^>]*>\{title\}<\/h1>/);
assert.match(compare, /isBaseline && "bg-primary text-primary-foreground"/);
assert.match(compare, /Card[\s\S]*Select[\s\S]*Table[\s\S]*Dialog/);
assert.match(compare, /Table className="w-auto table-fixed" containerClassName="max-h-\[37\.5rem\] overflow-auto rounded-md border"[\s\S]*TableRow key=\{group\.key\} className="h-\[4\.5rem\]"/);
assert.match(compare, /sticky left-0 top-0 z-30[\s\S]*sticky top-0 z-20/);
assert.doesNotMatch(compare, /ScrollArea/);
assert.doesNotMatch(compare, /spacePanning|handlePanStart|handlePanMove|handlePanEnd|event\.code !== "Space"/);
assert.doesNotMatch(compare, /กด Space ค้างแล้วลาก|<Badge[^>]*>Space<\/Badge>/);
assert.match(compare, /competitorComparison[\s\S]*lowestCompetitorPrice[\s\S]*moreExpensive[\s\S]*cheaper/);
assert.match(compare, /label="แพงกว่าคู่แข่ง"[\s\S]*label="ถูกกว่าคู่แข่ง"/);
assert.match(compare, /sm:grid-cols-2 xl:grid-cols-5/);
assert.doesNotMatch(compare, /game\.available === false|ยังไม่พบหน้า/);
assert.match(compare, /\{editable \? \([\s\S]*setManageOpen\(true\)[\s\S]*จัดการเกม/);
assert.match(compare, /addGame[\s\S]*\/api\/gameinfo\/\$\{provider\}-games[\s\S]*method: "POST"[\s\S]*JSON\.stringify\(\{ url: gameUrl \}\)/);
assert.match(compare, /removeGame[\s\S]*\$\{provider\}-games\?game=\$\{encodeURIComponent\(game\.value\)\}[\s\S]*method: "DELETE"/);
assert.match(compare, /marketGameUrl\(game\.slug\)[\s\S]*ดูบน \{marketLabel\}/);
assert.match(compare, /disabled=\{gameBusy \|\| games\.length < 2\}/);
assert.match(compare, /เปิด \{page\?\.providerLabel \|\| "Kaleoz"\}: \{gameLabel\(page\?\.gameLabel/);
assert.match(compare, /!Number\.isFinite\(baselineOffer\.price\)/);
assert.match(compare, /Number\.isFinite\(offer\.price\) && Number\.isFinite\(baselineOffer\?\.price\)/);
assert.match(globals, /@custom-variant dark \(&:is\(\.dark \*, \[data-gameinfo-root\]\[data-theme="dark"\] \*\)\)/);
assert.match(globals, /\.dark,\s*\[data-gameinfo-root\]\[data-theme="dark"\] \{[\s\S]*--background: oklch\(0\.145 0 0\)/);


const { slugFromKaleozUrl } = await import("@/server/kaleoz-games-repository.js");
assert.equal(slugFromKaleozUrl("https://www.kaleoz.com/buy/honkai-star-rail?page=1"), "honkai-star-rail");
assert.equal(slugFromKaleozUrl("https://www.kaleoz.com/th/buy/Mobile-Legends"), "mobile-legends");
assert.equal(slugFromKaleozUrl("  zepeto  "), "zepeto");
assert.throws(() => slugFromKaleozUrl(""), /วางลิงก์/);
assert.throws(() => slugFromKaleozUrl("https://example.com/buy/zepeto"), /ลิงก์ไม่ถูกต้อง/);

const gamesRoute = readFileSync(new URL("../src/app/api/gameinfo/kaleoz-games/route.js", import.meta.url), "utf8");
assert.match(gamesRoute, /export async function GET[\s\S]*requireGameinfoAccess/);
assert.match(gamesRoute, /export async function POST[\s\S]*requireGameinfoEditor[\s\S]*slugFromKaleozUrl[\s\S]*inspectKaleozGame[\s\S]*addKaleozGame[\s\S]*clearKaleozGameCache/);
assert.match(gamesRoute, /export async function DELETE[\s\S]*requireGameinfoEditor[\s\S]*deleteKaleozGame[\s\S]*clearKaleozGameCache/);
assert.match(gamesRoute, /recordGameinfoAudit/);

const marketPreferenceRepo = readFileSync(new URL("../src/server/gameinfo-market-preferences.js", import.meta.url), "utf8");
const marketPreferenceRoute = readFileSync(new URL("../src/app/api/gameinfo/market-preference/route.js", import.meta.url), "utf8");
assert.match(marketPreferenceRepo, /PRIMARY KEY \(user_id, provider, game\)/);
assert.match(marketPreferenceRepo, /ON CONFLICT \(user_id, provider, game\)[\s\S]*DO UPDATE SET baseline_seller/);
assert.match(marketPreferenceRoute, /export async function PUT[\s\S]*requireGameinfoAccess[\s\S]*saveGameinfoBaselineSeller/);

assert.match(globals, /\[data-gameinfo-root\] \[data-shadcn-focus\] :where\(a, button, input, select, textarea, summary\):focus-visible \{\s*outline: none;/);
assert.match(compare, /<div data-shadcn-focus className="flex flex-col gap-5">/);

assert.match(compare, /GAME_SORTS = \[[\s\S]*"custom"[\s\S]*"name-asc"[\s\S]*"name-desc"[\s\S]*"newest"[\s\S]*"oldest"/);
assert.match(compare, /sortGames\(gameItems\(gameList\), gameSort\)/);
assert.match(compare, /kaleoz-game-sort[\s\S]*selectGameSort/);
assert.match(compare, /setItem\(GAME_SORT_STORAGE_KEY, value\)/);

assert.match(compare, /aria-label="ล้างคำค้นหา"[\s\S]*setQuery\(""\)/);
assert.match(compare, /พบ \{number\(groups\.length\)\} จาก \{number\(page\?\.groups\?\.length \|\| 0\)\}/);

assert.match(compare, /function packName\(group\)[\s\S]*group\.packLabel \|\| \(group\.quantity == null/);
assert.match(compare, /const needle = query\.trim\(\)[\s\S]*packName\(group\)\.toLocaleLowerCase\("th"\)\.includes\(needle\)/);
assert.doesNotMatch(compare, /offer\.seller, offer\.server|needles/);

const runner = readFileSync(new URL("../src/server/kaleoz-zepeto.js", import.meta.url), "utf8");
assert.match(runner, /context\.options\.filter\(\(option\) => option\.value !== "0"\)/);
assert.match(runner, /const allCategories = \{[\s\S]*categories\.flatMap\(\(type\) => type\.packs\)[\s\S]*label: KALEOZ_UNCATEGORIZED_LABEL, path: \[\]/);
assert.match(runner, /productTypes: \[allCategories, \.\.\.categories\]/);
assert.match(runner, /KALEOZ_ALL_CATEGORIES_LABEL = "ทุกหมวดหมู่"/);
assert.match(runner, /label: KALEOZ_ALL_CATEGORIES_LABEL/);
assert.match(runner, /async function getGameCatalog\(game, force = false\) \{\s*if \(force\) kaleozCatalogCache\.delete\(game\.value\);/);
assert.match(runner, /loadKaleozPage\(game, requestedType, games, force\)/);
assert.match(runner, /if \(!offersByItemId\.has\(offer\.itemId\)\) offersByItemId\.set\(offer\.itemId, offer\)/);
assert.match(runner, /totalListings: sweep \? sweep\.totalListings : results\.reduce/);
assert.doesNotMatch(runner, /definition\.aggregate/);

const gameHeader = `<section id="subnav"><div id="game_cover"></div><div id="game_info"> <h1 data-gname data-gid="310">Auto Chess</h1> <ul> <li><span>Global</span></li> <li><span>Mobile</span></li> <li><span class="publisher">Dragonest Game</span></li> </ul> </div></section>`;
assert.equal(parseKaleozGameLabel(gameHeader), "Auto Chess · Global · Mobile");
assert.equal(parseKaleozGameLabel(`<div id="game_info"><h1>ZEPETO</h1><ul><li><span>Global</span></li><li><span>Mobile</span></li></ul></div>`), "ZEPETO · Global · Mobile");
assert.equal(parseKaleozGameLabel(`<div id="game_info"><h1>Solo &amp; Co (SEA)</h1></div>`), "Solo & Co (SEA)");
assert.equal(parseKaleozGameLabel("<p>no header</p>"), "");
assert.match(runner, /const stale = games\.filter\(\(game\) => !game\.labelRefreshedAt && !labelRefreshAttempted\.has\(game\.value\)\)/);
assert.match(runner, /saveKaleozGameLabel\(game\.value, label\)/);
const gamesRepo = readFileSync(new URL("../src/server/kaleoz-games-repository.js", import.meta.url), "utf8");
assert.match(gamesRepo, /ALTER TABLE kaleoz_games ADD COLUMN IF NOT EXISTS label_refreshed_at TIMESTAMPTZ/);
assert.match(gamesRepo, /UPDATE kaleoz_games SET label = \$2, label_refreshed_at = NOW\(\)/);
assert.match(gamesRepo, /INSERT INTO kaleoz_games \(value, slug, label, sort_order, label_refreshed_at, label_revision\)[\s\S]*NOW\(\), \$\{KALEOZ_LABEL_REVISION\}\)/);

assert.match(gamesRepo, /export const KALEOZ_LABEL_REVISION = 2;/);
assert.match(gamesRepo, /ALTER TABLE kaleoz_games ADD COLUMN IF NOT EXISTS label_revision INTEGER NOT NULL DEFAULT 0/);
assert.match(gamesRepo, /UPDATE kaleoz_games SET label_refreshed_at = NULL WHERE label_revision < \$1/);
assert.match(gamesRepo, /SET label = \$2, label_refreshed_at = NOW\(\), label_revision = \$3/);

// A title containing ">" must not truncate the attribute run it sits in.
const angleTitle = parseKaleozZepetoHtml(`<div data-item-count="1"></div><div class="unit" data-stock="5" data-item-promotion="1"><div class="cell tit" eventlabel="ZEPETO &gt; 9700 Coins | Via UID" itemId="276664" price="70.88" currency="THB" sellerName="Meimeing"><img class="ItemPic" alt="ZEPETO &gt; 9700 Coins | Via UID" data-original="https://img/x.jpg"></div></div>`, { slug: "zepeto" });
assert.equal(angleTitle.offers.length, 1);
assert.equal(angleTitle.offers[0].itemId, "276664");
assert.equal(angleTitle.offers[0].price, 70.88);
assert.equal(angleTitle.offers[0].seller, "Meimeing");
assert.equal(angleTitle.offers[0].imageUrl, "https://img/x.jpg");
assert.equal(angleTitle.offers[0].productUrl, "https://www.kaleoz.com/buy/zepeto/276664");
assert.match(runner, /const TAG_ATTRS = \/\(\?:"\[\^"\]\*"\|/);

console.log("\n94 passed");
