import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const source = readFileSync(new URL("../src/app/gameinfo/[lang]/russia-check/page.js", import.meta.url), "utf8");
let user = { access: true };
const calls = [];
const modules = {
  "next/navigation": { notFound() { throw Error("404"); }, redirect(path) { throw Error(`redirect:${path}`); } },
  "@/server/session-user": { getSessionUser: async () => user },
  "@/server/auth": { hasGameinfoAccess: (current) => current?.access },
  "@/lib/permissions": { hasPermission: () => false },
  "@/server/gameinfo-russia-check": {
    getRussiaCheckDashboard: async ({ gameId }) => { calls.push(["dashboard", gameId]); return { games: [139, 22, 2147483647].map((id) => ({ gameId: id })), items: [{ gameId }] }; },
    listRussiaCheckLogs: async ({ gameId }) => { calls.push(["logs", gameId]); return { events: [{ gameId }] }; },
  },
  "@/components/gameinfo-russia-check-page": { default: "RussiaPage" },
};
const context = vm.createContext({ exports: {}, require: (name) => {
  if (!(name in modules)) throw Error(`Unexpected module ${name}`);
  return modules[name];
}, React: { createElement: (type, props) => ({ type, props }) } });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const open = (gameId, lang = "th") => context.exports.default({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({ gameId }) });

for (const id of ["139", "22", "2147483647"]) {
  calls.length = 0;
  const result = await open(id, "en");
  assert.equal(result.props.initialGameId, Number(id));
  assert.equal(result.props.key, Number(id));
  assert.equal(result.props.lang, "en");
  assert.deepEqual(calls, [["dashboard", Number(id)], ["logs", Number(id)]]);
}
for (const id of [undefined, "", "all"]) {
  assert.equal((await open(id)).props.initialGameId, null);
}
for (const id of ["bad", "-1", "0", "1.5", "1e2", "2147483648", ["139", "22"]]) {
  calls.length = 0;
  await assert.rejects(open(id), /404/);
  assert.equal(calls.length, 0);
}
await assert.rejects(open("999"), /404/);
calls.length = 0;
user = null;
await assert.rejects(open("139"), /redirect:\/$/);
assert.equal(calls.length, 0);
user = { access: false };
await assert.rejects(open("139"), /redirect:\/gameinfo\/th/);
assert.equal(calls.length, 0);

const client = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
assert.match(client, /useState\(initialGameId == null \? "all" : String\(initialGameId\)\)/);
const logs = readFileSync(new URL("../src/components/gameinfo-russia-check-game-logs-page.js", import.meta.url), "utf8");
assert.match(logs, /item.gameName[\s\S]*<Link href=\{`\/gameinfo\/\$\{lang\}\/russia-check\?gameId=\$\{item.gameId\}`\}/);
assert.match(logs, /aria-label=\{`ดู Pack ของ \$\{item.gameName\}`\}/);
console.log(`${assertions} passed`);
