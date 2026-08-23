import { canManageGameinfo, hasGameinfoAccess, hasProjectmAccess } from "../src/server/auth.js";

const cases = [
  ["admin เข้าได้", { projectmRole: "admin" }, true],
  ["topup เข้าได้", { projectmRole: "topup" }, true],
  ["ผู้ใช้ทั่วไปเข้า Projectm ได้", { projectmRole: null }, true],
  ["ผู้ที่ยังไม่ login เข้าไม่ได้", null, false],
];
const failed = cases.filter(([, user, expected]) => hasProjectmAccess(user) !== expected);

const gameinfoCases = [
  ["GameInfo Topup เข้าได้", { gameinfoRole: "topup" }, true, false],
  ["GameInfo Admin จัดการได้", { role: "user", gameinfoRole: "admin" }, true, true],
  ["ไม่มีสิทธิ์ GameInfo เข้าไม่ได้", { role: "admin", gameinfoRole: null }, false, false],
];
cases.push(...gameinfoCases);
failed.push(
  ...gameinfoCases.filter(
    ([, user, canAccess, canManage]) =>
      hasGameinfoAccess(user) !== canAccess || canManageGameinfo(user) !== canManage
  )
);

console.log(`\n${cases.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) {
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  process.exit(1);
}
