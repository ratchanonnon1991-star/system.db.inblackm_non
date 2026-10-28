import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const homeRoute = read("../src/app/gameinfo/[lang]/page.js");
const homeManageRoute = read("../src/app/gameinfo/[lang]/manage/page.js");
const gameRoute = read("../src/app/gameinfo/[lang]/[id]/page.js");
const gameManageRoute = read("../src/app/gameinfo/[lang]/[id]/manage/page.js");
const homePage = read("../src/components/gameinfo-home-page.js");
const detailPage = read("../src/components/gameinfo-game-detail-page.js");
const viewSwitch = read("../src/components/gameinfo-view-switch.js");
const backLink = read("../src/components/gameinfo-back-link.js");
const packEditor = read("../src/components/gameinfo-pack-editor.js");
const gamelistCards = read("../src/components/gameinfo-gamelist-cards.js");
const modeToggle = read("../src/components/gameinfo-mode-toggle.js");
const gameLayout = read("../src/app/gameinfo/[lang]/layout.js");

const checks = [
  homeRoute.includes('query.manage === "1"') && homeRoute.includes("gameinfoListHref(lang, dataMode, true)"),
  gameRoute.includes('query.manage === "1"') && gameRoute.includes("gameinfoGameHref(lang, id, dataMode, true)"),
  homeManageRoute.includes("manage />") && gameManageRoute.includes("manage />"),
  homePage.includes("manage && !editableRole") && detailPage.includes("manage && !editableRole"),
  backLink.includes("requestGameinfoBack(href)"),
  packEditor.includes("requestGameinfoBack(backHref)"),
  !backLink.includes("router.back()") && !packEditor.includes("router.back()"),
  gamelistCards.includes('aria-controls="gameinfo-filter-sidebar"') &&
    gamelistCards.includes('sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full"') &&
    gamelistCards.includes('event.key === "Escape"'),
  // Topup / Product is for everyone; editing follows gameinfo.admin only.
  homePage.includes("resolveGameinfoView({ param: rawView") && homePage.includes("editable={editableRole} topupView={topupView}"),
  viewSwitch.includes("Topup") && viewSwitch.includes("Product") && viewSwitch.includes("rememberGameinfoView(view)") && !modeToggle.includes("มุมมอง Topup"),
  // The bar shows only on a game's detail page, which renders it with the view
  // it resolved itself — a layout would keep the first page's view.
  detailPage.includes("<GameinfoViewSwitch savedView={view} isAdmin={editableRole} />") && !gameLayout.includes("GameinfoViewSwitch"),
  // No eye button: "ข้อมูลเกม" opens the game page, in Product for admins and Topup for everyone else.
  !gamelistCards.includes("<Eye") && !gamelistCards.includes("GameinfoDetailsButton") &&
    gamelistCards.includes("rememberGameinfoView(gameinfoRoleView(editable))") && gamelistCards.includes("prefetch={false}") &&
    gamelistCards.includes("ข้อมูลเกม") && gamelistCards.includes("bg-linear-primary px-3"),
  detailPage.includes("resolveGameinfoView({ param: rawView") &&
    detailPage.includes("editHref={editableRole ? manageHref : null}") &&
    detailPage.includes("gameinfoViewColumnRole(") &&
    detailPage.includes("const listHref = gameinfoListHref(lang, dataMode, false);"),
];
const failed = checks.filter((passed) => !passed).length;

console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
