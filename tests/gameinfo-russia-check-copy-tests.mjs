import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const page = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
const source = page.slice(page.indexOf("function CopyPackName("), page.indexOf("function LoadingTable("));
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
let state = "idle";
let effect;
let timerCallback;
let clearedTimer;
const writes = [];
const context = vm.createContext({
  React: { createElement: (type, props, ...children) => ({ type, props, children }) },
  useState: () => [state, (next) => { state = next; }],
  useEffect: (callback) => { effect = callback; },
  setTimeout: (callback, delay) => { timerCallback = callback; assert.equal(delay, 2000); return 42; },
  clearTimeout: (id) => { clearedTimer = id; },
  navigator: { clipboard: { writeText: async (text) => { writes.push(text); } } },
  Button: "Button", Spinner: "Spinner", Check: "Check", Copy: "Copy",
  cn: (...classes) => classes.join(" "),
});
vm.runInContext(compiled, context);
const name = "แพ็กใหม่ — Traveler's Gift 🎁";
const render = () => context.CopyPackName({ name });
let tree = render();
const button = tree.children[0];
assert.equal(button.props.type, "button");
assert.equal(button.props["aria-label"], `คัดลอกชื่อ Pack: ${name}`);
assert.equal(button.props.disabled, false);
assert.equal(tree.children[1].props.role, "status");
const copying = button.props.onClick();
assert.equal(state, "pending");
assert.equal(render().children[0].props.disabled, true);
await copying;
assert.deepEqual(writes, [name]);
assert.equal(state, "copied");
tree = render();
assert.equal(tree.children[0].children[0].type, "Check");
assert.equal(tree.children[1].children[0], "คัดลอกแล้ว");
const cleanup = effect();
timerCallback();
assert.equal(state, "idle");
cleanup();
assert.equal(clearedTimer, 42);

context.navigator.clipboard.writeText = async () => { throw Error("Permission denied"); };
await render().children[0].props.onClick();
assert.equal(state, "failed");
tree = render();
assert.equal(tree.children[0].props.disabled, false);
assert.match(tree.children[1].children[0], /คัดลอกไม่สำเร็จ/);
assert.doesNotMatch(tree.children[1].children[0], /คัดลอกแล้ว/);
context.navigator.clipboard = undefined;
await render().children[0].props.onClick();
assert.equal(state, "failed");
context.navigator.clipboard = { writeText: async (text) => { writes.push(text); } };
await render().children[0].props.onClick();
assert.equal(state, "copied");
assert.deepEqual(writes, [name, name]);
assert.match(page, /CopyPackName key=\{item.name\} name=\{item.name\}/);
assert.match(page, /CopyPackName key=\{event.packName\} name=\{event.packName\}/);
console.log(`${assertions} passed`);
