import assert from "node:assert/strict";
import { gameinfoRoleView, gameinfoViewColumnRole, normalizeGameinfoView, rememberGameinfoView, resolveGameinfoView } from "../src/lib/gameinfo-view.js";

let passed = 0;
function check(actual, expected, message) {
  assert.equal(actual, expected, message);
  passed += 1;
}

check(resolveGameinfoView({ isAdmin: true }), "product", "admins start in Product");
check(resolveGameinfoView({ isAdmin: false }), "topup", "everyone else starts in Topup");
check(gameinfoRoleView(true), "product", "opening a game from the list: Product for admins");
check(gameinfoRoleView(false), "topup", "and Topup for everyone else");
globalThis.document = { cookie: "" };
rememberGameinfoView("product");
check(globalThis.document.cookie.startsWith("gameinfo-view=product;"), true, "the view is remembered in the cookie the server reads");
globalThis.document.cookie = "";
rememberGameinfoView("bogus");
check(globalThis.document.cookie, "", "an unknown view is never written");
delete globalThis.document;
check(resolveGameinfoView({ cookie: "product", isAdmin: false }), "product", "a non-admin can choose Product");
check(resolveGameinfoView({ cookie: "topup", isAdmin: true }), "topup", "an admin can choose Topup");
check(resolveGameinfoView({ param: "topup", cookie: "product", isAdmin: true }), "topup", "a ?view= link wins over the remembered view");
check(resolveGameinfoView({ param: "nonsense", cookie: "product", isAdmin: false }), "product", "an unknown ?view= falls back to the remembered view");
check(normalizeGameinfoView(" PRODUCT "), "product", "view names are case- and space-tolerant");
check(gameinfoViewColumnRole("topup"), "topup", "Topup uses the topup column rules");
check(gameinfoViewColumnRole("product"), "admin", "Product uses the full column rules");

console.log(`${passed} passed`);
