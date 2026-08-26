import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extractZepetoPackQuantity,
  groupKaleozZepetoOffers,
  normalizeKaleozProductType,
  parseKaleozZepetoHtml,
} from "@/server/kaleoz-zepeto.js";

assert.equal(extractZepetoPackQuantity("Zepeto (GL) - 256 Zem (128 x 2 Zem)"), 256);
assert.equal(extractZepetoPackQuantity("Zepeto(Global) - 1k ZEMS"), 1000);
assert.equal(normalizeKaleozProductType("coins"), "coins");
assert.equal(normalizeKaleozProductType("invalid"), "zems");

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
assert.match(cards, /Game Bot Auto[\s\S]*เทียบราคาแพ็ค/);
assert.match(compare, /ชื่อ Pack[\s\S]*sellers\.map[\s\S]*ราคาต่ำสุด[\s\S]*ราคาแพงสุด[\s\S]*ดูรายละเอียด/);
assert.match(compare, /isCheapest[\s\S]*text-linear-primary/);
assert.match(compare, /SELLER_ORDER_KEY/);
assert.match(compare, /DndContext[\s\S]*SortableSellerHeader/);
assert.match(compare, /Seller ตัวตั้ง[\s\S]*SellerPriceCell/);
assert.match(compare, /ArrowDown[\s\S]*ถูกกว่า[\s\S]*ArrowUp[\s\S]*แพงกว่า/);
assert.match(compare, /หน่วยเงินในเกม[\s\S]*Coins[\s\S]*Premium/);
assert.match(compare, /HIDDEN_COLUMNS_KEY/);
assert.match(compare, /เลือกคอลัมน์/);
assert.match(compare, /visibleSellers[\s\S]*showCheapest[\s\S]*showMostExpensive[\s\S]*showDetails/);
assert.match(compare, /AUTO_REFRESH_MS[\s\S]*setInterval[\s\S]*รีข้อมูลตอนนี้[\s\S]*อัปเดตล่าสุด/);

console.log("\n10 passed");
