import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const stale = (input) => spawnSync(process.execPath, ["scripts/pm2-stale-node.cjs"], { input, encoding: "utf8" }).stdout;
const proc = (name, interpreter) => ({ name, pm2_env: { exec_interpreter: interpreter } });

const list = JSON.stringify([
  proc("system.db.inblackm", "node"),
  proc("usdcodashop-sync-worker", process.execPath),
  proc("itune-sheet-sync-worker", "/www/server/nvm/versions/node/v22.0.0/bin/node"),
  proc("some-other-site", "node"),
]);
check(stale(list) === "system.db.inblackm itune-sheet-sync-worker", "our apps on another Node, never another site's");
check(stale(`>>>> In-memory PM2 is out-of-date\n${list}`) === "system.db.inblackm itune-sheet-sync-worker", "a warning before the JSON is skipped");
check(stale(JSON.stringify([proc("system.db.inblackm", process.execPath)])) === "", "nothing to move when already on this Node");
check(stale("") === "" && stale("not json") === "", "no output when pm2 gives nothing readable");

const apps = createRequire(import.meta.url)("../ecosystem.config.cjs").apps;
check(apps.every((app) => app.interpreter === process.execPath), "every app starts on the deploy's Node");
const deploy = read("../deploy-server.sh");
check(deploy.includes('DEPLOY_NODE_VERSION:-24') && deploy.includes("node scripts/pm2-stale-node.cjs"), "deploy uses Node 24 and moves stale apps");
check(read("../.github/workflows/deploy.yml").includes('NODE_VERSION="24"'), "the workflow deploys on the same Node");

console.log(`pm2-stale-node: ${passed} passed`);
