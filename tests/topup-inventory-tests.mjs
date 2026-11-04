import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as topupInventory from "../src/lib/topup-inventory.js";
import * as topupInventoryStatsModule from "../src/lib/topup-inventory-stats.js";
import * as lucide from "lucide-react";
import { hasPermission } from "../src/lib/permissions.js";

const { TOPUP_INVENTORY_PROVIDERS, topupInventoryPath, ituneInventoryPath, topupInventoryMatch } = topupInventory;
const { topupInventoryStats } = topupInventoryStatsModule;
const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let user = null;
let pathname = "/projectm/th/topup-inventory";
const redirect = (path) => { throw Object.assign(new Error("redirect"), { path }); };
const mocks = {
  "next/link": { __esModule: true, default: (props) => React.createElement("a", props) },
  "next/navigation": { redirect, notFound: () => { throw new Error("notFound"); }, useRouter: () => ({ push() {} }), usePathname: () => pathname },
  "next/font/google": { Sora: () => ({ variable: "font-sora" }), Noto_Sans_Thai: () => ({ variable: "font-noto" }) },
  "lucide-react": lucide,
  "./topup-inventory-home.css": {},
  "./topup-inventory.css": {},
  "@/components/projectm-theme-context": { useProjectmTheme: () => ({ theme: "light", choice: "auto", setChoice() {} }) },
  "@/lib/topup-inventory-stats": topupInventoryStatsModule,
  "@/server/session-user": { getSessionUser: async () => user },
  "@/lib/permissions": { hasPermission },
  "@/lib/topup-inventory": topupInventory,
  "@/lib/projectm-i18n": { isSupportedLang: (lang) => lang === "th" },
  "@/server/auth": { hasProjectmAccess: (account) => Boolean(account) },
  "@/components/projectm-theme-root": { __esModule: true, default: ({ children }) => children },
};
function compile(path) {
  const output = ts.transpileModule(read(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("require", "exports", output)((specifier) => mocks[specifier] || require(specifier), exports);
  return exports;
}
mocks["@/components/topup-inventory-page"] = compile("src/components/topup-inventory-page.js");
const Home = compile("src/components/topup-inventory-home.js").default;
mocks["@/components/topup-inventory-home"] = { __esModule: true, default: Home };
const hub = compile("src/app/projectm/[lang]/topup-inventory/page.js");
const itune = compile("src/app/projectm/[lang]/topup-inventory/itune/page.js");
const layout = compile("src/app/projectm/[lang]/layout.js").default;
const params = Promise.resolve({ lang: "th" });
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
const html = renderToStaticMarkup(await hub.default({ params }));
check(html.includes("<h1>Topup <em>Inventory</em></h1>"), "hub title");
mocks["./topup-inventory-fonts.css"] = {};
mocks["@/components/topup-inventory-shell"] = compile("src/components/topup-inventory-shell.js");
const sectionLayout = compile("src/app/projectm/[lang]/topup-inventory/layout.js").default;
const framed = renderToStaticMarkup(await sectionLayout({ params, children: "service page" }));
check(framed.startsWith('<div class="tiv-fonts font-sora font-noto"><div class="tiv">') && framed.includes("service page"), "every Topup Inventory page gets the design's fonts and frame");
check(framed.includes('href="/"') && framed.includes("กลับเมนูหลัก") && framed.includes('aria-checked="true" aria-label="ตามระบบ"'), "the home's bar leads to the main menu; the theme switch shows the choice");
pathname = "/projectm/th/topup-inventory/plsbuy";
const service = renderToStaticMarkup(await sectionLayout({ params, children: "service page" }));
check(service.includes('class="tiv-back" href="/projectm/th/topup-inventory"') && !service.includes("กลับเมนูหลัก"), "a service page's bar leads back to the home");
check(html.includes('href="/projectm/th/topup-inventory/alerts"') && html.includes("แจ้งเตือนสต็อก"), "stock alerts card");
check(html.includes('aria-busy="true"') && !html.includes("ปักหมุดไว้"), "counts load after mount; nothing pinned before storage is read");
check((html.match(/class="tiv-chip"/g) || []).length === 7 && html.includes("ทั้งหมด <span class=\"n\">16</span>"), "currency chips with the number of cards");
for (const [group, keys] of [["tools", ["reservations", "ledger", "channels", "alerts"]], ["asia", ["gamepoint", "plsbuy", "donshop", "agenh2h"]], ["wallet", ["wavepay", "moniepoint"]]]) {
  check(keys.every((key) => TOPUP_INVENTORY_PROVIDERS.find((p) => p.key === key)?.group === group), `${group} section`);
}
check(TOPUP_INVENTORY_PROVIDERS.filter((p) => p.logo).every((p) => existsSync(new URL(`../public/topup-inventory/${p.logo}`, import.meta.url))), "every logo file exists");
const plsbuy = TOPUP_INVENTORY_PROVIDERS.find((p) => p.key === "plsbuy");
check(topupInventoryMatch(plsbuy, "pls") && topupInventoryMatch(plsbuy, "myr") && topupInventoryMatch(plsbuy, "", "MYR"), "search by name and currency");
check(!topupInventoryMatch(plsbuy, "razer") && !topupInventoryMatch(plsbuy, "", "IDR"), "search leaves out other cards");
const counts = topupInventoryStats([
  { provider: "plsbuy", balance: "120.50", target: "100.00", source: "plsbuy_api" },
  { provider: "wavepay", balance: "40", target: "100", source: "bot" },
  { provider: "wavepay", balance: "0", target: null, source: "bot" },
  { provider: "razer", balance: null, target: null, source: "stock" },
  { provider: "usdcodashop", balance: null, target: "50.00", source: "unavailable" },
]);
check(counts.active.total === 4 && counts.active.byProvider.wavepay === 2, "active counts readable accounts only");
check(counts.ready.total === 2 && counts.ready.byProvider.wavepay === 1 && !counts.ready.byProvider.razer, "ready needs a balance above zero");
check(counts.low.total === 1 && counts.low.byProvider.wavepay === 1, "low is under half of the target");
check(topupInventoryStats([{ provider: "plsbuy", balance: "1", target: null, source: "bot" }]).low.total === null, "no targets: low is unknown, not zero");
check(html.includes('href="/projectm/th/topup-inventory/gamepoint"') && html.includes("Gamepoint"), "Gamepoint is available");
check(html.includes(`href="${ituneInventoryPath("th")}"`), "iTune child link");
check(html.includes("Moniepoint") && html.includes("USDCodashop"), "future services");
check((html.match(/data-inventory-state="coming-soon"/g) || []).length === 1, "Moniepoint remains informational, not a broken link");
check(!html.includes('href="/projectm/th/topup-inventory/moniepoint"'), "no broken future links");
check(html.includes('href="/projectm/th/topup-inventory/usdcodashop"'), "USDCodashop is available");
check(html.includes('href="/projectm/th/topup-inventory/wavepay"') && html.includes("WavePay"), "WavePay is available");
check(html.includes('href="/projectm/th/topup-inventory/multigamecard"') && html.includes("Multigamecard"), "Multigamecard is available");
check(html.includes('href="/projectm/th/topup-inventory/garena-shell"') && html.includes("Garena Shell"), "Garena Shell is available");
check(html.includes('href="/projectm/th/topup-inventory/netease"') && html.includes("Netease"), "Netease is available");
check(html.includes('href="/projectm/th/topup-inventory/razer"') && html.includes("Razer Gold"), "Razer Gold is available");
check(hub.metadata.title === "Topup Inventory", "hub browser title");
check(itune.metadata.title === "iTune | Topup Inventory", "child browser title");
check(html.includes('href="/projectm/th/topup-inventory/ledger"') && html.includes("ยกยอดเติมมือ"), "debit page card");
check(html.includes('href="/projectm/th/topup-inventory/channels"') && html.includes("ยอดเติมมือรายบัญชี"), "per-account hand use card");
check(html.includes('href="/projectm/th/topup-inventory/reservations"') && html.includes("จองช่องทาง"), "reservation page card");
for (const path of ["src/app/projectm/[lang]/page.js", "src/app/projectm/[lang]/itune/page.js"]) {
  await assert.rejects(compile(path).default({ params }), { path: topupInventoryPath("th") }); assertions++;
}
await assert.rejects(itune.default({ params }), { path: "/" }); assertions++;
await assert.rejects(layout({ params, children: "private" }), { path: "/" }); assertions++;
await assert.rejects(layout({ params: Promise.resolve({ lang: "invalid" }), children: "private" }), /notFound/); assertions++;
for (const [permissions, admin, topup] of [[[], false, false], [["projectm.claim"], false, true], [["projectm.admin", "projectm.claim"], true, true]]) {
  user = { id: 1, permissions };
  const child = renderToStaticMarkup(await itune.default({ params }));
  check(child.includes('href="/projectm/th/itune/admin"') === admin, "admin respects permission");
  check(child.includes('href="/projectm/th/itune/topup"') === topup, "topup respects permission");
  check(child.includes("<b>Topup Inventory</b> · iTune"), "child sits under the hub (the frame's bar links back)");
}
check(read("src/components/itune-admin-shell.js").includes("href={ituneInventoryPath(lang)}"), "admin back link");
check(read("src/app/projectm/[lang]/itune/topup/page.js").includes("href={ituneInventoryPath(lang)}"), "topup back link");
check(read("src/app/page.js").includes('label: "Topup Inventory"'), "main menu renamed");
console.log(`\n${assertions} passed, 0 failed`);
export const previewMarkup = html;
export const ituneMarkup = renderToStaticMarkup(await itune.default({ params }));
