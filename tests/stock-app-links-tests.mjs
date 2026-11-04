import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bangkokToday,
  STOCK_LINK_WARN_DAYS,
  stockAppLinkDaysLeft,
  stockAppLinkDaysText,
  stockAppLinkTone,
  validateStockAppLink,
} from "../src/lib/stock-app-links.js";
import { allocatePurchaseOrderCosts } from "../src/lib/stock-purchase-orders.js";
import { STOCK_MIN_MARGIN, stockMargin, stockMarginTone } from "../src/lib/stock.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// App install links: name, https link and an expiry date; warned before they run out.
const good = validateStockAppLink({ name: " Cydia ", url: "https://example.test/x", expiresOn: "2027-09-14" });
check(good.link?.name === "Cydia" && good.link.expiresOn === "2027-09-14", "a link with name, https and date is kept");
check(validateStockAppLink({ name: "", url: "https://a.test", expiresOn: "2027-01-01" }).error, "a link needs a name");
check(validateStockAppLink({ name: "BG", url: "http://a.test", expiresOn: "2027-01-01" }).error, "only https links");
check(validateStockAppLink({ name: "BG", url: "https://a.test", expiresOn: "" }).error, "a link needs its expiry date");
check(stockAppLinkDaysLeft("2026-11-18", "2026-11-04") === 14, "days left counts whole days");
check(stockAppLinkTone(STOCK_LINK_WARN_DAYS) === "soon" && stockAppLinkTone(STOCK_LINK_WARN_DAYS + 1) === "ok", "warns from 14 days before");
check(stockAppLinkTone(0) === "soon" && stockAppLinkTone(-1) === "expired", "today is soon, yesterday is expired");
check(stockAppLinkDaysText(-3) === "หมดแล้ว 3 วัน" && stockAppLinkDaysText(0) === "หมดวันนี้" && stockAppLinkDaysText(9) === "เหลือ 9 วัน", "days left reads in Thai");
check(bangkokToday(new Date("2026-11-04T18:00:00Z")) === "2026-11-05", "today is counted in Bangkok time");
check(!read("../src/server/stock-app-link-repository.js").includes("password"), "links store no login or password");
check(read("../src/app/api/stock/links/route.js").includes("requireStockEditor"), "only Stock editors add links");

// Cost per unit split from the order's THB by each pack's USD value.
const split = allocatePurchaseOrderCosts([{ itemId: 1, qty: 10, unitCost: "" }, { itemId: 2, qty: 5, unitCost: "" }], { 1: "1.2", 2: "4.8" }, 1440);
check(split[0].unitCost === "48" && split[1].unitCost === "192", "a 4.8 USD pack costs four times a 1.2 USD one");
check(split.reduce((sum, line) => sum + Number(line.unitCost) * line.qty, 0) === 1440, "the split adds back to the order's THB");
const typed = [{ itemId: 1, qty: 10, unitCost: "50" }, { itemId: 2, qty: 5, unitCost: "" }];
check(allocatePurchaseOrderCosts(typed, { 1: "1.2", 2: "4.8" }, 1440) === typed, "a typed cost is never overwritten");
const noUsd = [{ itemId: 1, qty: 1, unitCost: "" }, { itemId: 3, qty: 1, unitCost: "" }];
check(allocatePurchaseOrderCosts(noUsd, { 1: "1.2" }, 100) === noUsd, "a pack without a USD value leaves costs blank");
check(allocatePurchaseOrderCosts(noUsd, { 1: "1", 3: "1" }, null) === noUsd, "no THB amount (no rate) leaves costs blank");

// Profit as % of the sale, flagged under the sheet's 10%.
check(stockMargin(226, 1280) === 17.7, "226 on 1,280 is 17.7%");
check(stockMargin(10, 0) === null && stockMargin(null, 100) === null, "no margin without a sale price or profit");
check(stockMarginTone(STOCK_MIN_MARGIN - 0.1) === "low" && stockMarginTone(STOCK_MIN_MARGIN) === "ok" && stockMarginTone(-1) === "loss", "under 10% is low, below 0 a loss");

console.log(`stock-app-links: ${passed} passed`);
