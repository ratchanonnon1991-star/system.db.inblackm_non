import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTopupBaseUrl, getTopupSsoSecret, topupAdminGrant, TOPUP_SSO_ADMIN_PERMISSIONS, TOPUP_SSO_NEW_ACCOUNT, TOPUP_SSO_ROLES } from "../src/lib/topup-sso.js";
import { PERMISSION_KEYS } from "../src/lib/permissions.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

check(getTopupBaseUrl({ TOPUP_BASE_URL: "https://inblackm.com/" }) === "https://inblackm.com", "TopUp's origin, trailing slash dropped");
check(getTopupBaseUrl({ NEXT_PUBLIC_TOPUP_BASE_URL: "https://inblackm.com" }) === "https://inblackm.com", "the public variable works too");
assert.throws(() => getTopupBaseUrl({}), /TOPUP_BASE_URL/);
passed += 1;
assert.throws(() => getTopupSsoSecret({ NODE_ENV: "production" }), /TOPUP_SSO_SECRET/);
passed += 1;
check(getTopupSsoSecret({ NODE_ENV: "development" }) === "tools-sso-dev-secret", "a local default matching TopUp's");
check(TOPUP_SSO_ROLES.join() === "admin,staff", "only TopUp staff may sign in");
check(TOPUP_SSO_NEW_ACCOUNT.role === "staff" && TOPUP_SSO_NEW_ACCOUNT.permissions.join() === "gameinfo.access,gameinfo.report", "a first TopUp sign-in is Staff with GameInfo's top-up view");

const route = read("../src/app/api/sso/from-topup/route.js");
check(route.includes('"x-tools-sso-secret": getTopupSsoSecret()') && route.includes("/api/sso/tools/exchange"), "the code is redeemed server-to-server with the shared secret");
check(route.includes("if (!TOPUP_SSO_ROLES.includes(topupRole)) return failure(\"not_staff\");"), "customers are turned away even if TopUp answered");
check(route.includes("findOrProvisionSsoUser(email, TOPUP_SSO_NEW_ACCOUNT)"), "new TopUp accounts are made with that access");
check(route.includes('user && topupRole === "admin" ? topupAdminGrant(user) : null'), "only TopUp's admins become Admins, not its staff");
check(TOPUP_SSO_ADMIN_PERMISSIONS.length === PERMISSION_KEYS.size && TOPUP_SSO_ADMIN_PERMISSIONS.every((key) => PERMISSION_KEYS.has(key)), "a TopUp admin gets every permission");
const staffGrant = topupAdminGrant({ role: "staff", permissions: ["gameinfo.access", "gameinfo.report"] });
check(staffGrant.role === "admin", "a Staff account becomes Admin");
check(staffGrant.permissions.length === PERMISSION_KEYS.size && staffGrant.permissions.includes("gameinfo.admin") && staffGrant.permissions.includes("stock.admin"), "with every system's Admin permission");
check(topupAdminGrant({ role: "user", permissions: [] }).role === "admin", "a template-only account becomes Admin too");
check(topupAdminGrant({ role: "admin", permissions: [...TOPUP_SSO_ADMIN_PERMISSIONS] }) === null, "an Admin with everything is left alone");
check(topupAdminGrant({ role: "admin", permissions: ["gameinfo.access"] }).role === undefined, "an Admin is only given the missing permissions");
const repository = read("../src/server/gamedb-sso-map-repository.js");
check(repository.includes("WHERE LOWER(username) = $1 OR LOWER(COALESCE(display_name, '')) = $1") && repository.includes("if (result.rows.length === 1)"), "an email links to the one existing account named after it, never a guess between several");
const page = read("../src/app/page.js");
check(page.includes("/admin/tools-sso?return=") && page.includes("เข้าสู่ระบบด้วยบัญชี TopUp"), "the login page offers TopUp");
check(!page.includes("/api/sso/gamedb?return="), "the hiring button is gone");

console.log(`topup-sso: ${passed} passed`);
