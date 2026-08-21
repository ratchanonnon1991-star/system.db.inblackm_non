import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../src/", import.meta.url);
const apiRoot = new URL("app/api/gameinfo/", root);
const routes = readdirSync(apiRoot, { recursive: true })
  .filter((name) => name.endsWith("route.js"))
  .map((name) => readFileSync(new URL(name.replaceAll("\\", "/"), apiRoot), "utf8"));
const usersRepository = readFileSync(new URL("server/users-repository.js", root), "utf8");
const usersModal = readFileSync(new URL("components/gamedb-modals.js", root), "utf8");
const layout = readFileSync(new URL("app/gameinfo/[lang]/layout.js", root), "utf8");

const checks = [
  ["GameInfo routes do not use the generic login guard", routes.every((route) => !route.includes("requireAdmin"))],
  ["GameInfo routes do not inspect Projectm permission", routes.every((route) => !route.includes("projectmRole"))],
  ["GameInfo role is persisted separately", usersRepository.includes("gameinfo_role")],
  ["GameInfo role has its own user setting", usersModal.includes("สิทธิ์ GameInfo")],
  ["GameInfo page blocks accounts without access", layout.includes("hasGameinfoAccess(user)")],
];
const failed = checks.filter(([, passed]) => !passed);

console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
for (const [name] of failed) console.error(`FAIL: ${name}`);
process.exit(failed.length ? 1 : 0);
