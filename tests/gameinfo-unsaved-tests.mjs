import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const guard = read("../src/lib/gameinfo-unsaved-changes.js");
const files = [
  "../src/components/gameinfo-game-manager.js",
  "../src/components/gameinfo-pack-editor.js",
  "../src/components/gameinfo-gamelist-table.js",
].map(read);
const checks = [
  guard.includes('window.addEventListener("beforeunload"'),
  guard.includes('window.navigation?.addEventListener("navigate"'),
  guard.includes('document.addEventListener("click"'),
  files.every((source) => source.includes("useGameinfoUnsavedChanges(")),
];
const failed = checks.filter((passed) => !passed).length;

console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
