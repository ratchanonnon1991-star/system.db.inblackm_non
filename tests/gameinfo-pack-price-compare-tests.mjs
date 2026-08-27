import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extractZepetoPackQuantity,
  groupKaleozZepetoOffers,
  kaleozGameUrl,
  normalizeKaleozGame,
  normalizeKaleozProductType,
  parseKaleozGameCatalogHtml,
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
assert.match(compare, /Select items=\{sellerItems\}[\s\S]*selectBaselineSeller/);
assert.match(compare, /ArrowDown[\s\S]*ถูกกว่า[\s\S]*ArrowUp[\s\S]*แพงกว่า/);
assert.match(compare, /page\?\.productTypes[\s\S]*หมวดหมู่/);
assert.match(compare, /storageKey\("hidden-columns"/);
assert.match(compare, /เลือกคอลัมน์/);
assert.match(compare, /DropdownMenu[\s\S]*DropdownMenuCheckboxItem[\s\S]*showAllColumns/);
assert.match(compare, /visibleSellers[\s\S]*showCheapest[\s\S]*showMostExpensive[\s\S]*showDetails/);
assert.match(compare, /AUTO_REFRESH_MS[\s\S]*setInterval[\s\S]*รีเฟรชราคา[\s\S]*อัปเดต/);
assert.match(compare, /page\?\.games[\s\S]*selectGame[\s\S]*>เกม</);
assert.match(compare, /storageKey[\s\S]*currentGame/);
assert.match(compare, /cellTone[\s\S]*bg-destructive\/5[\s\S]*bg-muted\/60[\s\S]*bg-muted\/20/);
assert.match(compare, /ไม่มีราคาอ้างอิง/);
assert.match(compare, /<h1[^>]*>เทียบราคาแพ็ค<\/h1>/);
assert.match(compare, /isBaseline && "bg-primary text-primary-foreground"/);
assert.match(compare, /Card[\s\S]*Select[\s\S]*Table[\s\S]*Dialog/);
assert.match(compare, /Table className="min-w-\[980px\]" containerClassName="max-h-\[37\.5rem\] overflow-auto rounded-md border"[\s\S]*TableRow key=\{group\.key\} className="h-14"/);
assert.doesNotMatch(compare, /ScrollArea/);
assert.doesNotMatch(compare, /spacePanning|handlePanStart|handlePanMove|handlePanEnd|event\.code !== "Space"/);
assert.doesNotMatch(compare, /กด Space ค้างแล้วลาก|<Badge[^>]*>Space<\/Badge>/);
assert.match(compare, /competitorComparison[\s\S]*lowestCompetitorPrice[\s\S]*moreExpensive[\s\S]*cheaper/);
assert.match(compare, /label="แพงกว่าคู่แข่ง"[\s\S]*label="ถูกกว่าคู่แข่ง"/);
assert.match(compare, /sm:grid-cols-2 xl:grid-cols-5/);
assert.doesNotMatch(compare, /game\.available === false|ยังไม่พบหน้า/);
assert.match(compare, /editable \? \([\s\S]*setManageOpen\(true\)[\s\S]*จัดการเกม/);
assert.match(compare, /addGame[\s\S]*\/api\/gameinfo\/kaleoz-games[\s\S]*method: "POST"[\s\S]*JSON\.stringify\(\{ url: gameUrl \}\)/);
assert.match(compare, /removeGame[\s\S]*kaleoz-games\?game=\$\{encodeURIComponent\(game\.value\)\}[\s\S]*method: "DELETE"/);
assert.match(compare, /KALEOZ_GAME_URL\(game\.slug\)[\s\S]*ดูบน Kaleoz/);
assert.match(compare, /disabled=\{gameBusy \|\| games\.length < 2\}/);
assert.match(compare, /เปิด Kaleoz: \{page\?\.gameLabel/);
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

assert.match(globals, /\[data-gameinfo-root\] \[data-shadcn-focus\] :where\(a, button, input, select, textarea, summary\):focus-visible \{\s*outline: none;/);
assert.match(compare, /<div data-shadcn-focus className="flex flex-col gap-5">/);

assert.match(compare, /GAME_SORTS = \[[\s\S]*"custom"[\s\S]*"name-asc"[\s\S]*"name-desc"[\s\S]*"newest"[\s\S]*"oldest"/);
assert.match(compare, /sortGames\(selectItems\(gameList\), gameSort\)/);
assert.match(compare, /kaleoz-game-sort[\s\S]*selectGameSort/);
assert.match(compare, /setItem\(GAME_SORT_STORAGE_KEY, value\)/);

console.log("\n55 passed");
