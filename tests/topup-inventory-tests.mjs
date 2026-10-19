import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOPUP_INVENTORY_PROVIDERS, topupInventoryPath, ituneInventoryPath } from "../src/lib/topup-inventory.js";
import { hasPermission } from "../src/lib/permissions.js";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let user = null;
const redirect = (path) => { throw Object.assign(new Error("redirect"), { path }); };
const mocks = {
  "next/link": { __esModule: true, default: (props) => React.createElement("a", props) },
  "next/navigation": { redirect, notFound: () => { throw new Error("notFound"); } },
  "@/server/session-user": { getSessionUser: async () => user },
  "@/lib/permissions": { hasPermission },
  "@/lib/topup-inventory": { TOPUP_INVENTORY_PROVIDERS, topupInventoryPath, ituneInventoryPath },
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
const Home = compile("src/components/topup-inventory-home.js").default;
mocks["@/components/topup-inventory-home"] = { __esModule: true, default: Home };
const hub = compile("src/app/projectm/[lang]/topup-inventory/page.js");
const itune = compile("src/app/projectm/[lang]/topup-inventory/itune/page.js");
const layout = compile("src/app/projectm/[lang]/layout.js").default;
const params = Promise.resolve({ lang: "th" });
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
const html = renderToStaticMarkup(await hub.default({ params }));
check(html.includes("Topup Inventory"), "hub title");
check(html.includes(`href="${ituneInventoryPath("th")}"`), "iTune child link");
check(html.includes("Moniepoint") && html.includes("USDCodashop"), "future services");
check((html.match(/data-inventory-state="coming-soon"/g) || []).length === 1, "Moniepoint remains informational, not a broken link");
check(!html.includes('href="/projectm/th/topup-inventory/moniepoint"'), "no broken future links");
check(html.includes('href="/projectm/th/topup-inventory/usdcodashop"'), "USDCodashop is available");
check(html.includes('href="/projectm/th/topup-inventory/wavepay"') && html.includes("WavePay"), "WavePay is available");
check(html.includes('href="/projectm/th/topup-inventory/multigamecard"') && html.includes("Multigamecard"), "Multigamecard is available");
check(html.includes('href="/projectm/th/topup-inventory/garena-shell"') && html.includes("Garena Shell"), "Garena Shell is available");
check(html.includes('href="/projectm/th/topup-inventory/netease"') && html.includes("Netease"), "Netease is available");
check(hub.metadata.title === "Topup Inventory", "hub browser title");
check(itune.metadata.title === "iTune | Topup Inventory", "child browser title");
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
  check(child.includes(`href="${topupInventoryPath("th")}"`), "child returns to hub");
}
check(read("src/components/itune-admin-shell.js").includes("href={ituneInventoryPath(lang)}"), "admin back link");
check(read("src/app/projectm/[lang]/itune/topup/page.js").includes("href={ituneInventoryPath(lang)}"), "topup back link");
check(read("src/app/page.js").includes('label: "Topup Inventory"'), "main menu renamed");
console.log(`\n${assertions} passed, 0 failed`);
export const previewMarkup = html;
export const ituneMarkup = renderToStaticMarkup(await itune.default({ params }));
