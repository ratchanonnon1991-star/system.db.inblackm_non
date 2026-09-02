import { readFileSync } from "node:fs";
import {
  PERMISSIONS,
  hasPermission,
  normalizePermissions,
  togglePermission,
} from "../src/lib/permissions.js";

const checks = [];
const ok = (name, passed) => checks.push([name, Boolean(passed)]);

const projectmAdmin = normalizePermissions(["projectm.admin"]);
ok("Projectm has no access checkbox", !PERMISSIONS.some(({ key }) => key === "projectm.access"));
ok("Projectm Admin includes Topup", projectmAdmin.includes("projectm.claim"));
ok("removing Projectm Topup also clears Admin", !togglePermission(projectmAdmin, "projectm.claim", false).includes("projectm.admin"));

const gameinfoAdmin = normalizePermissions(["gameinfo.admin"]);
ok("GameInfo Admin includes reporting", gameinfoAdmin.includes("gameinfo.report"));
ok("GameInfo Admin includes market checks", gameinfoAdmin.includes("gameinfo.market_check"));
ok("Market check implies GameInfo access", normalizePermissions(["gameinfo.market_check"]).includes("gameinfo.access"));
ok("removing reporting also clears Admin", !togglePermission(gameinfoAdmin, "gameinfo.report", false).includes("gameinfo.admin"));
ok("legacy roles remain readable during migration", hasPermission({ projectmRole: "topup" }, "projectm.claim"));
ok("explicit permission grants are checked", hasPermission({ permissions: ["gameinfo.access"] }, "gameinfo.access"));

const profitAdmin = normalizePermissions(["profit.admin"]);
ok("Profit Admin includes view access", profitAdmin.includes("profit.access"));
ok("removing Profit access clears Admin too", !togglePermission(profitAdmin, "profit.access", false).includes("profit.admin"));
ok("Profit view-only grant does not imply edit", !normalizePermissions(["profit.access"]).includes("profit.admin"));

const loginRoute = readFileSync(new URL("../src/app/api/auth/login/route.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/app/page.js", import.meta.url), "utf8");
ok("login returns the complete public user", loginRoute.includes("publicUser"));
ok("home refreshes permissions when the tab regains focus", home.includes('addEventListener("focus"'));

const failed = checks.filter(([, passed]) => !passed);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
for (const [name] of failed) console.error(`FAIL: ${name}`);
process.exit(failed.length ? 1 : 0);
