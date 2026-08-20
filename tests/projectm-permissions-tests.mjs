import { canManageGameinfo, hasProjectmAccess } from "../src/server/auth.js";

const cases = [
  ["admin เข้าได้", { projectmRole: "admin" }, true],
  ["topup เข้าได้", { projectmRole: "topup" }, true],
  ["ไม่มีสิทธิ์เข้าไม่ได้", { projectmRole: null }, false],
];
const failed = cases.filter(([, user, expected]) => hasProjectmAccess(user) !== expected);

cases.push(
  ["topup จัดการเกมไม่ได้", { role: "staff", projectmRole: "topup" }, false],
  ["staff ปกติจัดการเกมได้", { role: "staff", projectmRole: null }, true]
);
failed.push(...cases.slice(3).filter(([, user, expected]) => canManageGameinfo(user) !== expected));

console.log(`\n${cases.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) {
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  process.exit(1);
}
