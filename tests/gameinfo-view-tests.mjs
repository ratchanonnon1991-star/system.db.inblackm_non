import assert from "node:assert/strict";
import { gameinfoViewColumnRole, normalizeGameinfoView, resolveGameinfoView } from "../src/lib/gameinfo-view.js";

let passed = 0;
function check(actual, expected, message) {
  assert.equal(actual, expected, message);
  passed += 1;
}

check(resolveGameinfoView({ isAdmin: true }), "product", "admins start in Product");
check(resolveGameinfoView({ isAdmin: false }), "topup", "everyone else starts in Topup");
check(resolveGameinfoView({ cookie: "product", isAdmin: false }), "product", "a non-admin can choose Product");
check(resolveGameinfoView({ cookie: "topup", isAdmin: true }), "topup", "an admin can choose Topup");
check(resolveGameinfoView({ param: "topup", cookie: "product", isAdmin: true }), "topup", "a ?view= link wins over the remembered view");
check(resolveGameinfoView({ param: "nonsense", cookie: "product", isAdmin: false }), "product", "an unknown ?view= falls back to the remembered view");
check(normalizeGameinfoView(" PRODUCT "), "product", "view names are case- and space-tolerant");
check(gameinfoViewColumnRole("topup"), "topup", "Topup uses the topup column rules");
check(gameinfoViewColumnRole("product"), "admin", "Product uses the full column rules");

console.log(`${passed} passed`);
