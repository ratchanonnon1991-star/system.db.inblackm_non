import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const homeRoute = read("../src/app/gameinfo/[lang]/page.js");
const homeManageRoute = read("../src/app/gameinfo/[lang]/manage/page.js");
const gameRoute = read("../src/app/gameinfo/[lang]/[id]/page.js");
const gameManageRoute = read("../src/app/gameinfo/[lang]/[id]/manage/page.js");
const homePage = read("../src/components/gameinfo-home-page.js");
const detailPage = read("../src/components/gameinfo-game-detail-page.js");
const backLink = read("../src/components/gameinfo-back-link.js");
const packEditor = read("../src/components/gameinfo-pack-editor.js");
const gamelistCards = read("../src/components/gameinfo-gamelist-cards.js");

const checks = [
  homeRoute.includes('query.manage === "1"') && homeRoute.includes("gameinfoListHref(lang, dataMode, true)"),
  gameRoute.includes('query.manage === "1"') && gameRoute.includes("gameinfoGameHref(lang, id, dataMode, true)"),
  homeManageRoute.includes("manage />") && gameManageRoute.includes("manage />"),
  homePage.includes("manage && !editableRole") && detailPage.includes("manage && !editableRole"),
  backLink.includes("confirmGameinfoNavigation()") && backLink.includes("router.replace(href)"),
  packEditor.includes("router.replace(backHref)"),
  !backLink.includes("router.back()") && !packEditor.includes("router.back()"),
  gamelistCards.includes('aria-controls="gameinfo-filter-sidebar"') &&
    gamelistCards.includes('sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full"') &&
    gamelistCards.includes('event.key === "Escape"'),
];
const failed = checks.filter((passed) => !passed).length;

console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
