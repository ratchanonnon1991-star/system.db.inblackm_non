// Orders waiting for a stock cut: which stock account an order's game belongs
// to, which pack it probably used, and which orders drop off the list. No DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  accountFitsOrderPlatform,
  autoCutPlan,
  isClosedOrderStatus,
  orderPlatform,
  stockOrderPackKey,
  suggestOrderPack,
  pendingStockOrders,
  stockAccountGameKeys,
  stockOrderGamePatterns,
  stockPendingDays,
  suggestStockItem,
  textNumbers,
} from "../src/lib/stock-pending-orders.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

const diablo = { id: 2, code: "diablo01", gameName: "DIABLO IMMORTAL", status: "check", items: [
  { id: 21, label: "60 Orb", packName: "60 Orb" },
  { id: 22, label: "320 Orb", packName: "320 Orb" },
  { id: 23, label: "1650 Orb", packName: "" },
] };
const wuwa = { id: 12, code: "wuthering01", gameName: "WUTHERING WAVES", status: "check", items: [
  { id: 121, label: "6480 Lunite", packName: "" },
  { id: 122, label: "Lunite Subscription", packName: "" },
] };
const pes1 = { id: 6, code: "pes1", gameName: "eFootball", status: "active", items: [{ id: 61, label: "750 Coin", packName: "750 Coin" }] };
const pes2 = { id: 7, code: "pes2", gameName: "eFootball", status: "active", items: [{ id: 71, label: "750 Coin", packName: "" }] };
const fc = { id: 3, code: "fc01", gameName: "", status: "check", items: [] };
const closed = { id: 9, code: "zzz", gameName: "Zenless Zone Zero", status: "closed", items: [] };

check(stockPendingDays("30") === 30 && stockPendingDays("0") === 14 && stockPendingDays("x") === 14 && stockPendingDays(500) === 60, "days default to 14 and cap at 60");
check(isClosedOrderStatus("❌ Rejected") && isClosedOrderStatus("cancelled") && !isClosedOrderStatus("manual") && !isClosedOrderStatus("failed"), "rejected and cancelled orders never need a cut; failed ones may have been filled by hand");
check(stockAccountGameKeys(fc).every((key) => key.length >= 4), "a code hint as short as \"fc\" is not used to match orders");
check(stockAccountGameKeys(diablo)[0] === "diabloimmortal", "the account's game name is a key");
const pokego = { id: 10, code: "pokemon", gameName: "Pokémon GO", status: "check", items: [] };
check(JSON.stringify(stockAccountGameKeys(pokego)) === '["pokemongo"]', "an account with a game name is not matched by its code hint");
check(pendingStockOrders([{ task_request_id: "1", game_name: "Pokemon Unite", pack_name: "60", status: "pending" }], [pokego]).length === 0, "Pokemon Unite orders do not land on a Pokémon GO stock");
const usd = [{ id: 1, label: "20 USD", packName: "" }, { id: 2, label: "5 USD", packName: "320 Orb" }];
check(suggestStockItem("4.22 300+20", usd) === null, "a +bonus number does not pick a pack");
check(suggestStockItem("320 Orb", usd)?.id === 2, "the GameInfo pack name is read before the label");
check(stockOrderGamePatterns([diablo]).includes("%diablo%immortal%"), "the SQL pre-filter matches the game's words in order");
check(JSON.stringify(textNumbers("✨ 6,480 ЛУНИТОВ ✨")) === '["6480"]' && JSON.stringify(textNumbers("4.22 300+20")) === '["4.22","300"]', "numbers are read out of free-text pack names, without the +bonus");

check(suggestStockItem("✨ 6480 ЛУНИТОВ ✨", wuwa.items)?.id === 121, "a pack whose number is in the order is suggested");
check(suggestStockItem("✨ Lunite Subscription✨", wuwa.items) === null, "no number, no suggestion");
check(suggestStockItem("60 / 320 bundle", diablo.items) === null, "two packs fit: a person picks");
check(suggestStockItem("1650", diablo.items)?.id === 23, "a pack with no GameInfo name is matched by its label");

const orders = [
  { task_request_id: "556347", order_id: "30679544", game_name: "#Diablo immortal (via login 2fa)", pack_name: "60", price: "0.84", status: "pending", source: "russia", created_at: "2026-11-05T10:00:00Z" },
  { task_request_id: "556347", order_id: "30679544", game_name: "#Diablo immortal (via login 2fa)", pack_name: "60", price: "0.84", status: "pending", source: "russia", created_at: "2026-11-05T10:00:00Z" },
  { task_request_id: "p-1", order_id: "1f1d", game_name: "Wuthering Waves", pack_name: "✨ 6480 ЛУНИТОВ ✨", price: "350.10", status: "pending", created_at: "2026-11-05T12:00:00Z" },
  { task_request_id: "556000", order_id: "300", game_name: "Wuthering Waves", pack_name: "6480", status: "❌ Rejected", created_at: "2026-11-05T09:00:00Z" },
  { task_request_id: "555000", order_id: "301", game_name: "Pokemon Unite", pack_name: "60", status: "pending", created_at: "2026-11-05T09:00:00Z" },
  { task_request_id: "554000", order_id: "302", game_name: "Wuthering Waves", pack_name: "6480", status: "pending", created_at: "2026-11-04T09:00:00Z" },
  { task_request_id: "553000", order_id: "30600", game_name: "Wuthering Waves", pack_name: "6480", status: "pending", created_at: "2026-11-04T08:00:00Z" },
  { task_request_id: "552000", order_id: "303", game_name: "eFootball 2026", pack_name: "750 Coin", status: "manual", created_at: "2026-11-03T09:00:00Z" },
  { task_request_id: "551000", order_id: "304", game_name: "Zenless Zone Zero", pack_name: "300", status: "pending", created_at: "2026-11-03T09:00:00Z" },
];
const list = pendingStockOrders(orders, [diablo, wuwa, pes1, pes2, fc, closed], new Set(["554000", "30600"]));
const refs = list.map((order) => order.ref);
check(JSON.stringify(refs) === '["p-1","556347","552000"]', `newest first, one row per order, closed / unrelated / done ones dropped (got ${refs})`);
check(list[1].accounts.length === 1 && list[1].accounts[0].code === "diablo01" && list[1].suggestion?.itemId === 21, "a Russia Diablo order lands on diablo01 with its 60 Orb pack");
check(list[0].suggestion?.accountId === 12 && list[0].suggestion.itemId === 121, "the Wuthering order suggests 6480 Lunite");
check(list[2].accounts.length === 2 && list[2].suggestion === null, "an order two accounts could fill suggests nothing");
check(!refs.includes("551000"), "a closed account takes no orders");

// The page and the prefilled ตัดออก form, rendered with made-up data.
const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url)), cache = new Map();
function compile(file) {
  if (!path.extname(file)) file += ".js";
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
  new Function("require", "exports", output)((name) => {
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
    if (name.startsWith("@/")) return compile(path.join(root, "src", name.slice(2)));
    if (name.startsWith(".")) return compile(path.resolve(path.dirname(file), name));
    return require(name);
  }, exports);
  return exports;
}
const withLeft = (account) => ({ ...account, items: account.items.map((item) => ({ ...item, left: 5, avgCost: 10, unitUsd: 1 })) });
const pageAccounts = [withLeft(diablo), withLeft(wuwa)];
const Page = compile(path.join(root, "src/components/stock-pending-orders.js")).default;
const pageData = { orders: pendingStockOrders(orders, pageAccounts), skipped: [], accounts: pageAccounts, days: 14 };
const editorHtml = renderToStaticMarkup(React.createElement(Page, { data: pageData, canEdit: true }));
check(editorHtml.includes("ออเดอร์รอตัด stock") && editorHtml.includes("556347") && editorHtml.includes('href="/stock/diablo01"'), "the page lists each order with a link to its stock account");
check(editorHtml.includes("น่าจะเป็น 60 Orb · เหลือ 5"), "a suggested pack is shown with what is left");
check((editorHtml.match(/ตัด stock<\/button>/g) || []).length === pageData.orders.length && editorHtml.includes("ไม่ได้ใช้ stock"), "an editor gets ตัด stock and ไม่ได้ใช้ stock on every order");
const viewerHtml = renderToStaticMarkup(React.createElement(Page, { data: pageData, canEdit: false }));
check(!viewerHtml.includes("ตัด stock</button>") && !viewerHtml.includes("ไม่ได้ใช้ stock</button>"), "a viewer sees the list without buttons");
const errorHtml = renderToStaticMarkup(React.createElement(Page, { data: { ...pageData, orders: [], error: "อ่านออเดอร์จากฐานข้อมูลหลักไม่ได้" }, canEdit: true }));
check(errorHtml.includes("อ่านออเดอร์จากฐานข้อมูลหลักไม่ได้"), "a failed order read says so instead of an empty list");

const Dialog = compile(path.join(root, "src/components/stock-move-dialog.js")).default;
const dialogHtml = renderToStaticMarkup(React.createElement(Dialog, { kind: "out", accounts: pageAccounts, defaultAccountId: 2, initialItemId: 21, initialQueue: "556347",
  initialNote: "Diablo · 60", order: pageData.orders[1], onClose() {} }));
check(/<input id="stock-queue"[^>]*value="556347"/.test(dialogHtml), "the form opens with the order's queue number");
check(/<option value="21" selected="">/.test(dialogHtml) && /aria-label="จำนวน"[^>]*value="1"/.test(dialogHtml), "the suggested pack is picked with 1 unit");
check(!/<select id="stock-account"[^>]*disabled/.test(dialogHtml), "the account can still be changed");
check(dialogHtml.includes("ราคาในออเดอร์ 0.84"), "the order is shown on top of the form");


// Learning a pack from earlier cuts, and when the system may cut by itself.
check(stockOrderPackKey("✨ Lunite Subscription✨") === stockOrderPackKey("lunite  subscription") && stockOrderPackKey("✨ 6480 ЛУНИТОВ ✨") === "6480лунитов", "a pack text is learned regardless of case, spaces and emoji, Cyrillic kept");
const learned = new Map([[`12|${stockOrderPackKey("Lunite Subscription")}`, 122]]);
check(suggestOrderPack("✨ Lunite Subscription✨", [wuwa], learned)?.source === "learned" && suggestOrderPack("✨ Lunite Subscription✨", [wuwa], learned).itemId === 122, "a learned pack is suggested for the same order text");
check(suggestOrderPack("✨ 6480 ЛУНИТОВ ✨", [wuwa], learned)?.source === "number", "with nothing learned the number still suggests a pack");
check(suggestOrderPack("Lunite Subscription", [wuwa], new Map([[`12|${stockOrderPackKey("Lunite Subscription")}`, 999]])) === null, "a learned pack that no longer exists is not suggested");
const learnedTwice = new Map([[`6|750coin`, 61], [`7|750coin`, 71]]);
check(suggestOrderPack("750 Coin", [pes1, pes2], learnedTwice) === null, "a text learned on two accounts is left for a person");

const since = "2026-11-05T00:00:00Z";
const autoWuwa = { ...wuwa, autoCut: true, autoCutSince: since, items: wuwa.items.map((item) => ({ ...item, left: 3 })) };
const accountsById = new Map([[12, autoWuwa]]);
const pendingOrder = (patch = {}) => ({ ref: "p-9", accounts: [{ id: 12, code: "wuthering01" }], createdAt: "2026-11-05T08:00:00Z",
  suggestion: { accountId: 12, itemId: 122, source: "learned" }, ...patch });
check(JSON.stringify(autoCutPlan(pendingOrder(), accountsById)) === '{"accountId":12,"itemId":122}', "a learned pack on an auto-cut account is cut");
check(autoCutPlan(pendingOrder({ suggestion: { accountId: 12, itemId: 121, source: "number" } }), accountsById) === null, "a pack only guessed from a number is never cut by the system");
check(autoCutPlan(pendingOrder({ createdAt: "2026-11-04T23:59:00Z" }), accountsById) === null, "orders from before auto cut was turned on are left alone");
check(autoCutPlan(pendingOrder({ accounts: [{ id: 12 }, { id: 13 }] }), accountsById) === null, "an order two accounts could fill is left for a person");
check(autoCutPlan(pendingOrder(), new Map([[12, { ...autoWuwa, autoCut: false }]])) === null, "an account with auto cut off is never cut");
check(autoCutPlan(pendingOrder(), new Map([[12, { ...autoWuwa, items: autoWuwa.items.map((item) => ({ ...item, left: 0 })) }]])) === null, "a pack with nothing left is not cut");

const { runStockAutoCut } = await import("../src/server/stock-auto-cut.js");
const recorded = [];
const twoOrders = [pendingOrder({ ref: "new", createdAt: "2026-11-05T09:00:00Z", game: "Wuthering Waves", pack: "Lunite Subscription" }),
  pendingOrder({ ref: "old", createdAt: "2026-11-05T08:00:00Z", game: "Wuthering Waves", pack: "Lunite Subscription" }),
  pendingOrder({ ref: "guess", suggestion: { accountId: 12, itemId: 121, source: "number" } })];
const oneLeft = { ...autoWuwa, items: autoWuwa.items.map((item) => ({ ...item, left: 1 })) };
const run = await runStockAutoCut({
  list: async () => ({ orders: twoOrders, accounts: [oneLeft] }),
  record: async (move, actor) => { recorded.push({ move, actor }); return 1; },
});
check(run.cut === 1 && recorded.length === 1 && recorded[0].move.queue === "old", `with one unit left only the older order is cut (got ${recorded.map((r) => r.move.queue)})`);
check(recorded[0].move.awaiting === true && recorded[0].move.orderPack === "Lunite Subscription" && recorded[0].move.lines[0].qty === 1 && recorded[0].actor.name === "ระบบตัดอัตโนมัติ", "a system cut waits for a person, keeps the order's pack text and is signed by the system");
const offRun = await runStockAutoCut({ list: async () => ({ orders: twoOrders, accounts: [{ ...oneLeft, autoCut: false }] }), record: async () => { throw new Error("must not cut"); } });
check(offRun.cut === 0, "nothing is cut when no account has auto cut on");
const errorRun = await runStockAutoCut({ list: async () => ({ orders: twoOrders, accounts: [oneLeft], error: "down" }), record: async () => { throw new Error("must not cut"); } });
check(errorRun.cut === 0, "nothing is cut when the orders could not be read");
const dupRun = await runStockAutoCut({ list: async () => ({ orders: [twoOrders[1]], accounts: [oneLeft] }), record: async () => { const error = new Error("dup"); error.status = 409; throw error; } });
check(dupRun.skipped === 1 && dupRun.failed === 0, "a queue cut meanwhile is skipped, not counted as a failure");

const awaitingHtml = renderToStaticMarkup(React.createElement(Page, { canEdit: true, data: { ...pageData, awaiting: [
  { id: 5, accountId: 12, code: "wuthering01", queue: "p-1", note: "Wuthering Waves · Lunite", orderPack: "Lunite", createdAt: "2026-11-05T09:00:00Z", lines: [{ itemId: 122, label: "Lunite Subscription", qty: 1 }], orderStatus: "❌ Rejected" },
] } }));
check(awaitingHtml.includes("ระบบตัดให้แล้ว รอยืนยัน (1)") && awaitingHtml.includes("Lunite Subscription × 1"), "a system cut is listed for a person with what it took");
check(awaitingHtml.includes("ยืนยัน</button>") && awaitingHtml.includes("ผิดแพ็ค</button>"), "it can be confirmed or sent back");
check(awaitingHtml.includes("ควรกดไม่ได้ใช้ stock"), "an order rejected after the cut is flagged");
const learnedHtml = renderToStaticMarkup(React.createElement(Page, { canEdit: true, data: { ...pageData, orders: [{ ...pageData.orders[0], suggestion: { accountId: 12, itemId: 121, source: "learned" } }] } }));
check(learnedHtml.includes("จำไว้จากครั้งก่อน: 6480 Lunite"), "a learned pack says so");

// iOS and Android are different stock, written by hand in the order's pack text.
for (const [text, expected] of [
  ["4.44 550 IOS", "ios"], ["6.03 750 ios", "ios"], ["iPhone 550", "ios"],
  ["16.98 2130 Android", "android"], ["0.79 Great value for a set (Suarez) androif", "android"], ["550 андроид", "android"],
  ["3.49 Great value for a set", ""], ["4.44 840", ""], ["", ""], [null, ""], ["550 iOS / Android", ""],
  ["Radios 100", ""], ["Bios 100", ""],
]) check(orderPlatform(text) === expected, `"${text}" names "${expected}"`);

check(accountFitsOrderPlatform({ platform: "ios" }, "4.44 550 IOS"), "the same store fits");
check(!accountFitsOrderPlatform({ platform: "ios" }, "4.60 550 Android"), "the other store does not");
check(accountFitsOrderPlatform({ platform: "ios" }, "3.49 Great value"), "an order naming no store may still fit");
check(accountFitsOrderPlatform({ platform: "" }, "4.60 550 Android"), "an account naming no store is not ruled out");

const iosPes = { id: 9, code: "pes1", gameName: "eFootball", platform: "ios", status: "active", autoCut: true, autoCutSince: "2026-01-01T00:00:00Z", items: [{ id: 27, label: "4.8 USD", packName: "550 Coin / 840 Coin", left: 5 }] };
const pesOrder = (ref, pack) => ({ task_request_id: ref, game_name: "#eFootbal (PES) (via login 2fa)", pack_name: pack, status: "pending", source: "russia", created_at: "2026-11-01T00:00:00Z" });
const learnedAndroid = new Map([[`9|${stockOrderPackKey("4.60 550 Android")}`, 27], [`9|${stockOrderPackKey("4.44 550 IOS")}`, 27]]);
const pesPending = pendingStockOrders([pesOrder("a", "4.60 550 Android"), pesOrder("i", "4.44 550 IOS"), pesOrder("n", "4.44 840")], [iosPes], new Set(), learnedAndroid);
check(!pesPending.some((order) => order.ref === "a"), "an Android order leaves an iOS account's queue, even with a pack learned before");
check(pesPending.find((order) => order.ref === "i")?.suggestion?.itemId === 27, "the iOS order keeps its pack");
check(pesPending.some((order) => order.ref === "n"), "an order naming no store stays for a person to judge");
const pesById = new Map([[9, iosPes]]);
check(autoCutPlan(pesPending.find((order) => order.ref === "i"), pesById)?.itemId === 27, "auto cut still takes the iOS order");
const otherStore = pendingStockOrders([pesOrder("a", "4.60 550 Android")], [iosPes, { ...iosPes, id: 10, code: "pes2", platform: "" }], new Set(), new Map());
check(otherStore[0]?.accounts.length === 1 && otherStore[0].accounts[0].code === "pes2", "an account naming no store still answers an Android order");

check(stockOrderGamePatterns([iosPes]).includes("%efootbal%"), "the SQL filter also finds the channels' spelling");
check(stockAccountGameKeys(iosPes).includes("efootbal"), "so does the match by account");
check(pendingStockOrders([pesOrder("s", "4.44 550 IOS"), { ...pesOrder("t", "4.44 550 IOS"), game_name: "#EFootbalPESViaLogin2fa" }, { ...pesOrder("u", "4.44 550 IOS"), game_name: "eFootball 2026" }], [iosPes]).length === 3, "every spelling of the game reaches the account");
check(!pendingStockOrders([{ ...pesOrder("h", "1,000 Coin"), game_name: "Homescapes" }], [iosPes]).length, "another game stays out");

console.log(`${passed} passed`);
