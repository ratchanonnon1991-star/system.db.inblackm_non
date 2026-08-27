import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isGameinfoNavigationLeaving } from "../src/lib/gameinfo-unsaved-changes.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const guard = read("../src/lib/gameinfo-unsaved-changes.js");
const dialog = read("../src/components/gameinfo-unsaved-navigation-dialog.js");
const sharedDialog = read("../src/lib/use-gameinfo-dialog.js");
const layout = read("../src/components/gameinfo-pack-column-layout.js");
const csvImport = read("../src/components/gameinfo-csv-import-actions.js");
const cloneButton = read("../src/components/gameinfo-mode-clone-button.js");
const gameView = read("../src/components/gameinfo-game-view.js");
const packEditor = read("../src/components/gameinfo-pack-editor.js");
const files = [
  "../src/components/gameinfo-game-manager.js",
  "../src/components/gameinfo-pack-editor.js",
  "../src/components/gameinfo-gamelist-table.js",
  "../src/components/gameinfo-game-links.js",
  "../src/components/gameinfo-formula-variables.js",
  "../src/components/gameinfo-computed-editor.js",
  "../src/components/gameinfo-image-picker-modal.js",
  "../src/components/gameinfo-tags-input.js",
  "../src/components/gameinfo-tutorial-modal.js",
  "../src/components/gameinfo-report-panel.js",
  "../src/components/gameinfo-gamelist-cards.js",
].map(read);
const checks = [
  guard.includes('window.addEventListener("beforeunload"'),
  guard.includes('window.navigation?.addEventListener("navigate"'),
  guard.includes('document.addEventListener("click"'),
  !guard.includes("window.confirm("),
  guard.includes("isGameinfoNavigationLeaving(window.location.href, href)"),
  guard.includes("isGameinfoNavigationLeaving(window.location.href, link.href)"),
  guard.includes("requestGameinfoDiscard") && guard.includes("requestGameinfoReload"),
  guard.includes("navigationAllowanceTimer") && guard.includes("}, 1000)"),
  !guard.includes("if (allowingNavigation) {\n      allowingNavigation = false;"),
  dialog.includes("useRouter") && dialog.includes("router.push("),
  dialog.includes('target.kind === "discard"') && dialog.includes('target.kind === "reload"'),
  dialog.includes("consumeGameinfoBackHref"),
  files.every((source) => source.includes("useGameinfoUnsavedChanges(")),
  !layout.match(/const dirty =\s*legacyDraft/),
  csvImport.includes("allowGameinfoNavigation();\n      window.location.reload();"),
  !csvImport.includes("hasUnsavedChanges && !window.confirm"),
  sharedDialog.includes("bodyScrollLockCount") && sharedDialog.includes("openDialogs"),
  sharedDialog.includes("if (bodyScrollLockCount > 0) return;") && sharedDialog.includes("wasTopDialog"),
  guard.includes("export function hasGameinfoUnsavedChanges()"),
  cloneButton.includes("hasGameinfoUnsavedChanges()") && cloneButton.includes("requestGameinfoDiscard({"),
  cloneButton.includes("allowGameinfoNavigation();\n      window.location.reload();"),
  gameView.includes("useGameinfoUnsavedChanges(packLayout.dirty)"),
  packEditor.includes("dirty || packLayout.dirty || languageDraftDirty"),
  packEditor.includes('const languageDraftDirty = Boolean(languageDraft.trim())'),
];
const failed = checks.filter((passed) => !passed).length;

const current = "https://example.test/gameinfo/th/12/packs?mode=idpass";
assert.equal(isGameinfoNavigationLeaving(current, current), false, "current-page refresh stays on the page");
assert.equal(isGameinfoNavigationLeaving(current, `${current}#pack-1`), false, "hash-only navigation keeps drafts mounted");
assert.equal(isGameinfoNavigationLeaving(current, "https://example.test/gameinfo/th/12/packs?mode=uid"), true, "query changes can replace the draft surface");
assert.equal(isGameinfoNavigationLeaving(current, "https://example.test/gameinfo/th/13/packs?mode=idpass"), true, "route changes leave the editor");
assert.equal(isGameinfoNavigationLeaving(current, "https://outside.test/"), true, "external same-tab navigation leaves GameInfo");

console.log(`\n${checks.length - failed + 5} passed, ${failed} failed`);
if (failed) process.exit(1);
