import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/components/gameinfo-russia-check-logins-page.js", import.meta.url), "utf8");
assert.match(page, /สถานะ Login[\s\S]*เฉพาะเกมที่ต้องใช้ Session/);
assert.match(page, /Login ทุกเกมที่หลุด/);
assert.match(page, /Session หลุด[\s\S]*Session หมดอายุ[\s\S]*ยังไม่ได้ Login/);
assert.match(page, /lastFailedTrigger === "scheduled"[\s\S]*อัตโนมัติ/);
assert.match(page, /beginLogin\(\[game\]\)[\s\S]*>Login</);
assert.match(page, /method: "DELETE"[\s\S]*>Logout</);
assert.match(page, /setInterval[\s\S]*60_000/);
assert.match(page, /GameinfoRussiaCheckBrowserConnect[\s\S]*autoStart/);
assert.match(page, /เช็ค Session ทั้งหมด/);
assert.match(page, /checkSessions\(game\.sourceId\)[\s\S]*>เช็ค</);
assert.match(page, /brokenIds[\s\S]*beginLogin\(targets\)/);

const route = readFileSync(new URL("../src/app/gameinfo/[lang]/russia-check/logins/page.js", import.meta.url), "utf8");
assert.match(route, /hasGameinfoAccess/);
assert.match(route, /dashboard\.games\.filter\(\(game\) => game\.authRequired\)/);
assert.match(route, /hasPermission\(user, "gameinfo\.admin"\)/);

const server = readFileSync(new URL("../src/server/gameinfo-russia-check.js", import.meta.url), "utf8");
assert.match(server, /last_failed_trigger[\s\S]*last_failed_at/);
assert.match(server, /rs\.status='failed'[\s\S]*ORDER BY rs\.finished_at DESC/);
assert.match(server, /checkRussiaCheckSessions[\s\S]*fetchInfoldCatalog[\s\S]*fetchGryphlineCatalog/);

const checkRoute = readFileSync(new URL("../src/app/api/gameinfo/russia-check/sessions/check/route.js", import.meta.url), "utf8");
assert.match(checkRoute, /requireGameinfoEditor[\s\S]*checkRussiaCheckSessions/);

console.log("18 passed");
