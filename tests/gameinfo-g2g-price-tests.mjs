import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slugFromG2GUrl } from "@/server/g2g-games-repository.js";
import {
  fetchG2GPage,
  g2gGameUrl,
  groupG2GOffers,
  normalizeG2GGame,
  normalizeG2GGroup,
  parseG2GCatalogHtml,
} from "@/server/g2g-prices.js";

const html = `
  <title>ZEPETO Top Up only on G2G.com</title>
  <script>brand:{brandId:"lgc_game_29401",brandName:"Zepeto"},offers:[
    {offer_id:"G1",offer_attributes:[{collection_id:"pack",dataset_id:"zem-128"}],title:"128 ZEMS",available_qty:99,username:"Shop A",display_price:"5.45",display_currency:"USD",delivery_speed:"instant",satisfaction_rate:0.98,total_success_order:120,precheckout_url:"https://www.g2g.com/offer/1"},
    {offer_id:"G2",offer_attributes:[{collection_id:"pack",dataset_id:"coin-4680"}],title:"4,680 Coins",available_qty:50,username:"Shop B",display_price:"0.79",display_currency:"USD",delivery_speed:"manual",satisfaction_rate:1,total_success_order:20,precheckout_url:"https://www.g2g.com/offer/2"}
  ],marketingArticle:{}}</script>`;

const parsed = parseG2GCatalogHtml(html);
assert.equal(parsed.gameLabel, "Zepeto");
assert.equal(parsed.offers.length, 2);
assert.equal(parsed.offers[0].packKey, "zem-128");
assert.equal(parsed.offers[0].price, 5.45);
assert.equal(parsed.offers[0].seller, "Shop A");
assert.equal(parsed.offers[1].quantity, 4680);
assert.equal(groupG2GOffers(parsed.offers).length, 2);
assert.equal(g2gGameUrl("zepeto-top-up"), "https://www.g2g.com/categories/zepeto-top-up");
assert.equal(normalizeG2GGame("missing").value, "zepeto-top-up");
assert.equal(normalizeG2GGame("missing", []), null);
assert.equal(normalizeG2GGroup(null), "all");
assert.equal(slugFromG2GUrl("https://www.g2g.com/id/categories/zepeto-top-up"), "zepeto-top-up");
assert.equal(slugFromG2GUrl("zepeto-top-up"), "zepeto-top-up");
assert.throws(() => slugFromG2GUrl("https://playerok.com/categories/coins"), /ลิงก์ไม่ถูกต้อง/);

const page = await fetchG2GPage("zepeto-top-up", "zems", {
  fetchHtml: async () => html,
  force: true,
  games: [{ value: "zepeto-top-up", slug: "zepeto-top-up", label: "ZEPETO" }],
  store: { read: async () => null, save: async () => {} },
});
assert.equal(page.provider, "g2g");
assert.equal(page.productType, "zems");
assert.equal(page.groups.length, 1);
assert.equal(page.groups[0].key, "zem-128");

const providers = readFileSync(new URL("../src/server/gameinfo-market-providers.js", import.meta.url), "utf8");
assert.match(providers, /g2g:[\s\S]*loadG2GGames[\s\S]*fetchG2GPage/);
const compare = readFileSync(new URL("../src/components/gameinfo-pack-price-compare.js", import.meta.url), "utf8");
assert.match(compare, /TabsTrigger value="g2g"/);
assert.match(compare, /onClick=\{\(\) => setDeletePrompt\(game\)\}/);
assert.match(compare, /AlertDialogTitle>ยืนยันการลบลิงก์เกม<\/AlertDialogTitle>[\s\S]*removeGame\(deletePrompt\)/);
const route = readFileSync(new URL("../src/app/api/gameinfo/g2g-prices/route.js", import.meta.url), "utf8");
assert.match(route, /fetchG2GPage/);
const repository = readFileSync(new URL("../src/server/g2g-games-repository.js", import.meta.url), "utf8");
assert.match(repository, /to_regclass\('g2g_games'\)[\s\S]*if \(!tableExists/);

console.log("22 passed");
