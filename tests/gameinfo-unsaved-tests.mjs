import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const guard = read("../src/lib/gameinfo-unsaved-changes.js").replace(/\r\n/g, "\n");
const dialog = read("../src/components/gameinfo-unsaved-navigation-dialog.js");
const files = [
  "../src/components/gameinfo-game-manager.js",
  "../src/components/gameinfo-pack-editor.js",
  "../src/components/gameinfo-gamelist-table.js",
].map(read);
const checks = [
  guard.includes('window.addEventListener("beforeunload"'),
  guard.includes('window.navigation?.addEventListener("navigate"'),
  guard.includes('document.addEventListener("click"'),
  !guard.includes("window.confirm("),
  guard.includes("event.preventDefault();\n    window.dispatchEvent(new CustomEvent(GAMEINFO_NAVIGATION_REQUEST"),
  guard.includes("navigationAllowanceTimer") && guard.includes("}, 1000)"),
  !guard.includes("if (allowingNavigation) {\n      allowingNavigation = false;"),
  dialog.includes("useRouter") && dialog.includes("router.push("),
  dialog.includes("consumeGameinfoBackHref"),
  files.every((source) => source.includes("useGameinfoUnsavedChanges(")),
];
const failed = checks.filter((passed) => !passed).length;

console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
