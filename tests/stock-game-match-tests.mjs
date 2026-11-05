// Guessing a stock ID's GameInfo game, and คลัง showing the game on each card
// with a chip per game. The page is rendered with made-up accounts; no DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { matchStockGame, stockGameHints } from "../src/lib/stock-game-match.js";

let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };

const games = [
  { id: 1, name: "Diablo Immortal" }, { id: 2, name: "Delta Force" }, { id: 3, name: "EA SPORTS FC Mobile" },
  { id: 4, name: "Pokémon GO" }, { id: 5, name: "Pokémon TCG Pocket" }, { id: 6, name: "Honkai: Star Rail" },
];
check(matchStockGame({ code: "diablo01", gameName: "" }, games).game?.id === 1, "a code the sheets file under a game finds it");
check(matchStockGame({ code: "hsr", gameName: "" }, games).game?.id === 6, "punctuation in a name does not matter");
check(matchStockGame({ code: "pokego", gameName: "Pokemon GO" }, games).game?.id === 4, "accents do not matter");
check(matchStockGame({ code: "delta01", gameName: "" }, games).game?.id === 2, "a code's letters name a game the sheets do not");
const fc = matchStockGame({ code: "fc01", gameName: "" }, games);
check(!fc.game && fc.candidates.some((game) => game.id === 3), "a near name is only suggested, not saved");
const none = matchStockGame({ code: "zz9", gameName: "" }, games);
check(!none.game && !none.candidates.length, "an unknown code has no guess");
check(stockGameHints({ code: "diablo01", gameName: "Diablo" })[0] === "Diablo", "the account's own game name comes first");

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url)), cache = new Map();
function compile(file) {
  if (!path.extname(file)) file += ".js";
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
  new Function("require", "exports", output)((name) => {
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
    if (name.startsWith("@/")) return compile(path.join(root, "src", name.slice(2)));
    if (name.startsWith(".")) return compile(path.resolve(path.dirname(file), name));
    return require(name);
  }, exports);
  return exports;
}
const account = (id, code, gameId, gameName) => ({
  id, code, gameId, gameName, dataMode: "uid", status: "active", note: "", leftTotal: 1, valueUsd: 1, lowCount: 0, emptyCount: 0,
  items: [{ id, label: `P${id}`, unitUsd: 1, received: 2, left: 1, lowAt: 0, tone: "ok" }],
});
const Overview = compile(path.join(root, "src/components/stock-overview.js")).default;
const html = renderToStaticMarkup(React.createElement(Overview, { canEdit: false, games: [], logos: { 1: "/api/stock/games/7/logo?v=abc", 4: "/api/stock/games/7/logo?v=abc" }, accounts: [
  account(1, "rov1", 7, "RoV"), account(2, "loose1", null, ""), account(3, "gen1", 3, "Genshin"), account(4, "rov2", 7, "RoV"),
] }));
const chips = [...html.matchAll(/aria-pressed="(?:true|false)"[^>]*>(?:<img[^>]*>|<div aria-hidden="true"[^>]*>[^<]*<\/div>|<span class="w-1"><\/span>)?([^<]+) <span[^>]*>(\d+)<\/span>/g)].map((m) => `${m[1]} ${m[2]}`);
check(chips.join("|") === "ทุกเกม 4|Genshin 1|RoV 2|ยังไม่ผูกเกม 1", `one chip per game, unlinked last (got ${chips.join("|")})`);
check(/>RoV<\/p><p[^>]*><span[^>]*>rov1<\/span>/.test(html), "a card's title is its game, the ID under it");
check(/>loose1<\/p><p[^>]*><span[^>]*>ยังไม่ผูกเกม<\/span>/.test(html), "an unlinked card is titled by its ID and says it has no game");
const logoImgs = html.match(/<img src="\/api\/stock\/games\/7\/logo\?v=abc"/g) || [];
check(logoImgs.length === 3, `RoV's icon on its chip and both its cards (got ${logoImgs.length})`);
check(/>GE<\/div>/.test(html) && /<p[^>]*>Genshin<\/p>/.test(html), "a game with no icon shows its initials");
check(/>LO<\/div>/.test(html), "an unlinked ID shows its own letters");
console.log(`${passed} passed`);
