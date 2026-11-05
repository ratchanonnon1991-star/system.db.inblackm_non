// Render the actual clients to catch initialization failures that transpilation
// and API-only tests cannot detect. Effects do not run; no HTTP/DB writes occur.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url)), cache = new Map();
function compile(file) {
  if (!path.extname(file)) file += ".js";
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = readFileSync(file, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
  new Function("require", "exports", output)((name) => {
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name.startsWith("@/")) return compile(path.join(root, "src", name.slice(2)));
    if (name.startsWith(".")) return compile(path.resolve(path.dirname(file), name));
    return require(name);
  }, exports);
  return exports;
}
let passed = 0;
for (const provider of ["agenh2h", "donshop", "gamepoint", "netease", "plsbuy", "razer", "garena-shell", "multigamecard", "wavepay"]) {
  const component = compile(path.join(root, `src/components/${provider}-inventory.js`)).default;
  const html = renderToStaticMarkup(React.createElement(component, { lang: "th" }));
  assert.ok(html.includes("<main"), `${provider} initializes successfully`); passed++;
}
const usd = compile(path.join(root, "src/components/usdcodashop-ledger.js")).default;
assert.ok(renderToStaticMarkup(React.createElement(usd, { lang: "th" })).includes("<main")); passed++;
const debit = compile(path.join(root, "src/components/inventory-ledger-debit.js")).default;
assert.ok(renderToStaticMarkup(React.createElement(debit, { lang: "th" })).includes("<main")); passed++;
console.log(`${passed} passed`);
