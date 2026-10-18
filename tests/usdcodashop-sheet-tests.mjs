import assert from "node:assert/strict";
import { sheetCents, sheetFigures, listingFields, orderLink } from "../src/lib/usdcodashop-sheet.js";
import { createCodaSource } from "../src/server/usdcodashop-source.js";
let passed = 0; const check = (v) => { assert.ok(v); passed++; };
check(sheetCents("972.9459999999999") === 97295n);
check(sheetCents("7.4842") === 748n); check(sheetCents("120.398") === 12040n);
for (const invalid of [null, "", "=36005 * GOOGLEFINANCE(\"CURRENCY:IDRTHB\")", "1e5", "NaN", "-1"]) check(sheetCents(invalid) === null);
const f = sheetFigures({ saleThb: "147.25", costThb: "120.398" });
check(f.sale === "147.25" && f.cost === "120.40" && f.profit === "26.85" && f.margin === "18.23");
// The same percentage formula yields different profit when the cost basis differs.
const sourceExample = sheetFigures({ saleThb: "33.25", costThb: "29.9368" });
check(sourceExample.cost === "29.94" && sourceExample.profit === "3.31" && sourceExample.margin === "9.95");
const sheetExample = sheetFigures({ saleThb: "33.25", costThb: "30.77" });
check(sheetExample.profit === "2.48" && sheetExample.margin === "7.46");
check(sheetFigures({ saleThb: "0", costThb: "1" }).margin === null);
check(sheetFigures({ saleThb: "1", costThb: "2" }).profit === "-1.00");
check(sheetFigures({ costThb: "10" }).profit === null);
check(orderLink("javascript:alert(1)") === null); check(orderLink("https://user:password@example.com") === null);
check(orderLink("https://example.com/order/1") === "https://example.com/order/1");
const itemku = listingFields({ source: "itemku", sale_price: "36005" }, { listing_source: "itemku", sale_amount: "=36005 * GOOGLEFINANCE(\"CURRENCY:IDRTHB\")" });
check(itemku.saleThb === null && itemku.saleCurrency === "IDR" && itemku.saleNative === "36005");
check(listingFields({ source: "russia_reseller", sale_price: "1.25" }).saleThb === null);
check(listingFields({ source: "PAGE", sale_price: "290" }).saleThb === "290.00");
// K7319737: one 750.50 THB transfer for 2 packs -> each pack row carries half the sale.
const twoPacks = listingFields({ source: "kaleoz", sale_price: "750.5", pack_count: 2 }, { listing_source: "kaleoz", sale_amount: "750.5" });
check(twoPacks.saleThb === "375.25" && twoPacks.salePacks === 2 && twoPacks.saleNative === "750.5");
check(listingFields({ source: "PAGE", sale_price: "100", pack_count: 3 }).saleThb === "33.33");
check(!("salePacks" in listingFields({ source: "PAGE", sale_price: "290", pack_count: 1 })));
for (const bad of [0, -2, "x", 1.5, null]) check(listingFields({ source: "PAGE", sale_price: "290", pack_count: bad }).saleThb === "290.00");
let queries = 0;
const source = createCodaSource(async (sql) => {
  queries++;
  if (sql.includes("pack_count")) return [{ sale_key: "K1", pack_count: 1 }, { sale_key: "K2", pack_count: 2 }];
  if (sql.includes("FROM sheet_jobs")) return [
    { order_id: "K1", listing_source: "kaleoz", sale_amount: "17.10", buyer: "customer", link: "https://example.com/order/1", player_id: "uid1" },
    { order_id: "K1", listing_source: "coda-worker", filler: "BoT AtOM" },
  ];
  return [{ id: 1, source_order_id: "K1", source: "kaleoz", sale_price: "17.10", player_id: "uid1", method: "UID" },
    { id: 2, source_order_id: "K2", source: "PAGE", sale_price: "750.50" }, { id: 3, source_order_id: "K2", source: "PAGE", sale_price: "750.50" }];
});
const rows = await source.orders("0");
check(queries === 3); check(rows[0].sheet_fields.saleThb === "17.10" && !("salePacks" in rows[0].sheet_fields));
check(rows[1].sheet_fields.saleThb === "375.25" && rows[2].sheet_fields.saleThb === "375.25" && rows[2].sheet_fields.salePacks === 2);
check(rows[0].sheet_fields.customer === "customer" && rows[0].sheet_fields.playerId === "uid1");
check(rows[0].sheet_fields.sheetOperator === "BoT AtOM" && rows[0].sheet_fields.category === "UID");
console.log(`${passed} passed`);
