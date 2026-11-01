import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { gameinfoPackOffSale } from "@/lib/gameinfo-pack-model";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo } from "@/server/auth";
import { getGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";
import {
  getGamelistPacks,
  listAllGamelistChannels,
  listGamelistChannelsByGame,
  listGamelistPackLanguages,
} from "@/server/gameinfo-gamelist-packs";
import { getGamelistTutorial, getGamelistVpnNote, getGamelistWarning } from "@/server/gameinfo-gamelist-tutorial";
import { getGamelistImage } from "@/server/gameinfo-gamelist-image";
import { getGamelistLinks, legacyGamelistLinks } from "@/server/gameinfo-gamelist-links";
import { getGameinfoFormulaVariables } from "@/server/gameinfo-formula-variables";
import GameinfoGameView from "@/components/gameinfo-game-view";
import GameinfoViewSwitch from "@/components/gameinfo-view-switch";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";
import GameinfoBackLink from "@/components/gameinfo-back-link";
import GameinfoDatasetToggle from "@/components/gameinfo-dataset-toggle";
import { gameinfoGameHref, gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData } from "@/server/gameinfo-mode-data";
import GameinfoModeCloneButton from "@/components/gameinfo-mode-clone-button";
import GameinfoGameManager from "@/components/gameinfo-game-manager";
import GameinfoTopupWebPanel from "@/components/gameinfo-topup-web-panel";
import GameinfoTestAccounts, { GameinfoTestAccountsCard } from "@/components/gameinfo-test-accounts";
import GameinfoPriorityStars, { GameinfoWebBadge } from "@/components/gameinfo-priority-stars";
import { getGamelistGameSettings, listGamelistTestAccounts, maskGamelistTestAccount } from "@/server/gameinfo-game-settings";
import { getTopupWebGame, isTopupWebConnected, topupWebAdminUrl } from "@/server/gameinfo-topup-web";
import { GameinfoManageNav, GameinfoManageSection } from "@/components/gameinfo-manage-section";
import GameinfoWebMargin from "@/components/gameinfo-web-margin";
import GameinfoSalesChannelEditor, { GameinfoSalesChannelCards } from "@/components/gameinfo-sales-channels";
import { listGamelistSalesChannels } from "@/server/gameinfo-sales-channels";
import { listStockForGame } from "@/server/stock-repository";
import GameinfoMissingChecklist from "@/components/gameinfo-missing-checklist";
import { gameinfoMissingItems } from "@/lib/gameinfo-completeness";
import { gameinfoCostRatePacks } from "@/lib/gameinfo-channel-costs";
import { missingTopupWebPacks, topupWebPackImageFills } from "@/lib/gameinfo-topup-match";
import { previewTopupWebFill } from "@/server/gameinfo-topup-import";
import { getGameinfoExchangeRates } from "@/server/gameinfo-exchange-rates";
import {
  listGamelistPublisherImages,
  listGamelistPublishersByGame,
  listGamelistTagImages,
  listGamelistTagsByGame,
} from "@/server/gameinfo-gamelist-tags";
import { listGamelistReports } from "@/server/gameinfo-gamelist-reports";
import GameinfoReportPanel from "@/components/gameinfo-report-panel";
import GameinfoPackEditor from "@/components/gameinfo-pack-editor";
import { buildPackSuggestions } from "@/lib/gameinfo-suggestions";
import { hasPermission } from "@/lib/permissions";
import {
  hiddenGameinfoColumnKeys,
  stripHiddenGameinfoColumns,
} from "@/lib/gameinfo-column-roles";
import { cookies } from "next/headers";
import { GAMEINFO_VIEW_COOKIE, gameinfoViewColumnRole, resolveGameinfoView } from "@/lib/gameinfo-view";
import { listGameinfoColumnRoleRules } from "@/server/gameinfo-column-roles";
import { listGameinfoColumnOrders } from "@/server/gameinfo-column-order";
import { gameinfoColumnOrderFor } from "@/lib/gameinfo-pack-columns";

export default async function GameinfoGameDetailPage({ params, searchParams, manage = false }) {
  const { lang, id } = await params;
  const { mode: rawMode, view: rawView } = await searchParams;
  const dataMode = normalizeGameinfoDataMode(rawMode);
  const user = await getSessionUser();
  if (!user) redirect("/");
  const editableRole = canManageGameinfo(user);
  const canReport = hasPermission(user, "gameinfo.report");
  if (manage && !editableRole) redirect(gameinfoGameHref(lang, id, dataMode));
  const manageMode = manage && editableRole;
  const view = resolveGameinfoView({ param: rawView, cookie: (await cookies()).get(GAMEINFO_VIEW_COOKIE)?.value, isAdmin: editableRole });
  const topupView = !manageMode && view === "topup";
  // Columns are shared by every game, so the Topup view, which works with
  // only a few of them, would otherwise meet all of them everywhere. The view
  // picks the column rules, not the viewer's role: anyone can switch.
  const viewerRole = gameinfoViewColumnRole(topupView ? "topup" : "product");

  // A non-numeric segment here (e.g. a stale /admin bookmark from before that
  // path was removed) would otherwise reach getGameListRow() as NaN and blow
  // up as a Postgres "invalid input syntax for type bigint" error instead of
  // a clean 404 — this route matches any [id], numeric or not.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let row;
  let currencies = [];
  let computedColumns = [];
  let costProfiles = [];
  let formulaVariables = [];
  let existingNames = [];
  let tagSuggestions = [];
  let tagImages = {};
  let publisherSuggestions = [];
  let publisherImages = {};
  let reports = [];
  let allChannels = [];
  let packLanguages = [];
  let packVersion = 1;
  let hiddenColumnKeys = [];
  let settings = { topupGameId: null };
  let topupGame = null;
  let topupConnected = false;
  let testAccounts = [];
  let salesChannels = [];
  let stock = { accounts: [], byPack: {} };
  let costRatesOther = null;
  let columnOrder = null;
  try {
    row = await getGameListRow(numericId);
    if (row) {
      const modeData = dataMode === "idpass" ? await getGameinfoModeData(row.id, dataMode) : null;
      const packs = modeData?.packs || await getGamelistPacks(row.id);
      packVersion = Number(modeData?.version ?? packs.version) || 1;
      currencies = packs.currencies;
      computedColumns = packs.computedColumns;
      costProfiles = packs.costProfiles;
      // Rates state costs, so the Topup view goes without them. Null is that,
      // and a store that will not load only costs this page its other mode.
      if (!topupView) {
        const otherPacks = dataMode === "idpass" ? getGamelistPacks(row.id) : getGameinfoModeData(row.id, "idpass").then((data) => data.packs);
        costRatesOther = gameinfoCostRatePacks(await otherPacks.catch(() => ({})));
      }
      const packDisabledCount = currencies.reduce(
        (total, currency) => total + currency.categories.reduce(
          (categoryTotal, category) => categoryTotal + category.packs.filter((pack) => gameinfoPackOffSale(pack)).length,
          0
        ),
        0
      );
      const flatModePacks = currencies.flatMap((currency) =>
        currency.categories.flatMap((category) => category.packs)
      );
      const modeChannels = {
        main: [...new Set(flatModePacks.flatMap((pack) => pack.channelsMain || []))],
        secondary: [...new Set(flatModePacks.flatMap((pack) => pack.channelsSecondary || []))],
      };
      const [channelsByGame, allRows, tutorial, warning, vpnNote, image, storedLinks, variableData, tagsByGame, publishersByGame, loadedReports, sharedChannels, languages, loadedTagImages, loadedPublisherImages, columnRoleRules] = await Promise.all([
        listGamelistChannelsByGame(),
        listGameListRows(),
        dataMode === "idpass" ? Promise.resolve(modeData.tutorial) : getGamelistTutorial(row.id),
        dataMode === "idpass" ? Promise.resolve(modeData.warning) : getGamelistWarning(row.id),
        getGamelistVpnNote(row.id),
        getGamelistImage(row.id),
        dataMode === "idpass" ? Promise.resolve({ exists: true, links: modeData.links }) : getGamelistLinks(row.id),
        getGameinfoFormulaVariables(row.id),
        listGamelistTagsByGame(),
        listGamelistPublishersByGame(),
        listGamelistReports(row.id),
        manageMode ? listAllGamelistChannels() : Promise.resolve([]),
        manageMode ? listGamelistPackLanguages() : Promise.resolve([]),
        manageMode ? listGamelistTagImages() : Promise.resolve({}),
        manageMode ? listGamelistPublisherImages() : Promise.resolve({}),
        listGameinfoColumnRoleRules(),
      ]);
      // Same ordering the list table shows as "ลำดับ" (gamelist_order-aware,
      // falls back to id order) — this game's position within it.
      const orderPosition = allRows.findIndex((r) => r.id === row.id) + 1;
      existingNames = allRows.filter((item) => item.id !== row.id).map((item) => item.game);
      tagSuggestions = [...new Set(Object.values(tagsByGame).flat())].sort((a, b) => a.localeCompare(b, "th"));
      publisherSuggestions = [...new Set(Object.values(publishersByGame).flat())].sort((a, b) => a.localeCompare(b, "th"));
      reports = loadedReports;
      allChannels = sharedChannels;
      packLanguages = languages;
      tagImages = loadedTagImages;
      publisherImages = loadedPublisherImages;
      row = {
        ...row,
        ...(modeData?.fields || {}),
        channels: dataMode === "idpass" ? modeChannels : channelsByGame[row.id] || { main: [], secondary: [] },
        orderPosition: orderPosition > 0 ? orderPosition : null,
        hasTutorial: tutorial.categories.some((c) => c.steps.length > 0),
        hasWarning: warning.categories.some((c) => c.steps.length > 0),
        hasVpnNote: vpnNote.categories.some((c) => c.steps.length > 0),
        image: image.imageUrl,
        links: storedLinks.exists ? storedLinks.links : legacyGamelistLinks(row.link),
        packDisabledCount,
        serviceStatus: !row.serviceEnabled ? "offline" : packDisabledCount > 0 ? "partial" : "online",
        tags: tagsByGame[row.id] || [],
        tagImages,
        publishers: publishersByGame[row.id] || [],
        publisherImages,
        reportCount: loadedReports.filter((report) => report.status === "open").length,
      };
      formulaVariables = variableData.variables;
      // Website data and test accounts are extras: if they fail to load the
      // game page still opens, just without them.
      columnOrder = gameinfoColumnOrderFor(await listGameinfoColumnOrders().catch(() => ({})), row.id);
      [settings, testAccounts, topupConnected, salesChannels, stock] = await Promise.all([
        getGamelistGameSettings(row.id).catch(() => settings),
        listGamelistTestAccounts(row.id).catch(() => []),
        isTopupWebConnected().catch(() => false),
        listGamelistSalesChannels(row.id).catch(() => []),
        listStockForGame(row.id, dataMode).catch(() => stock),
      ]);
      topupGame = topupConnected ? await getTopupWebGame(settings.topupGameId).catch(() => null) : null;
      row = {
        ...row,
        priority: Math.min(3, Number(row.rankStars) || 0),
        sourceNote: (dataMode === "idpass" ? settings.sourceIdpass : settings.sourceUid) || "",
        web: topupGame ? { isActive: topupGame.isActive, uidEnabled: topupGame.uidEnabled, idpassEnabled: topupGame.idpassEnabled } : null,
      };
      hiddenColumnKeys = [...hiddenGameinfoColumnKeys(columnRoleRules, viewerRole, row.id)];
      // Enforced here rather than in the browser: a hidden column carries
      // its formula and its typed-in per-pack values, so leaving it in the
      // payload would hand the reader exactly what the rule hides. The
      // editor keeps the whole list on purpose — it saves what it is given,
      // and a filtered list would delete those definitions for every game.
      if (!manageMode) {
        computedColumns = stripHiddenGameinfoColumns(computedColumns, hiddenColumnKeys);
      }
    }
  } catch (err) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!row) notFound();

  const viewHref = gameinfoGameHref(lang, row.id, dataMode, false);
  const manageHref = gameinfoGameHref(lang, row.id, dataMode, true);
  // Back from a game, viewed or edited, is always the game list.
  const listHref = gameinfoListHref(lang, dataMode, false);
  const packGame = {
    id: row.id,
    gameName: row.game,
    region: row.region,
    platform: row.platform,
    server: row.server,
    currencies,
    computedColumns,
    costProfiles,
    formulaVariables,
    packLanguages,
    version: packVersion,
    costRatesOther,
    sourceNote: row.sourceNote,
    columnOrder,
  };

  if (manageMode) {
    // Today's stored USD rate only — no provider call while the page loads.
    const usdThb = topupGame
      ? await getGameinfoExchangeRates(["THBUSD"], { includeHistory: false, refreshStale: false })
        .then(([rate]) => (rate?.rate > 0 ? 1 / Number(rate.rate) : null))
        .catch(() => null)
      : null;
    const flatPacks = currencies.flatMap((currency) => currency.categories.flatMap((category) => category.packs));
    const gameinfoPacks = flatPacks.map((pack) => ({ name: pack.name, price: pack.price ?? "" }));
    const fillPreview = topupGame ? await previewTopupWebFill(row.id).catch(() => null) : null;
    const missingPacks = topupGame ? missingTopupWebPacks(topupGame.packages, flatPacks.map((pack) => pack.name), dataMode) : [];
    const packImageFills = topupGame ? topupWebPackImageFills(topupGame.packages, flatPacks) : [];
    const missingItems = gameinfoMissingItems({ row, packs: flatPacks, testAccountCount: testAccounts.length, linked: Boolean(topupGame), salesChannelCount: salesChannels.length });
    return (
      <>
        {/* Sticks under the red header (h-16) so the game being edited and
            the way back stay in view down a long pack table. */}
        <div className="sticky top-16 z-30 border-b border-linear-hairline bg-linear-surface-1/95 shadow-[0_8px_20px_-16px_rgba(0,0,0,0.4)] backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-7">
            <GameinfoBackLink
              className="flex h-10 items-center gap-1.5 rounded-full border border-linear-hairline bg-linear-surface-1 px-4 text-[13px] font-bold text-linear-ink transition hover:bg-linear-surface-2"
              href={listHref}
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <h1 className="truncate text-xl font-black text-linear-ink">แก้ไขเกม · {row.game}</h1>
              <span className="font-mono text-xs text-linear-ink-tertiary">ID: {row.id} · {dataMode === "idpass" ? "ID-PASS" : "UID"}</span>
            </div>
            <div className="flex items-center gap-2">
              <GameinfoPriorityStars gameId={row.id} value={row.priority} editable size={18} />
              {topupConnected ? <GameinfoWebBadge web={row.web} /> : null}
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-md bg-[#18181B] px-2 py-0.5 text-[11px] font-black tracking-[0.08em] text-white dark:bg-white dark:text-[#18181B]">ADMIN</span>
              {/* Viewing and editing one game are one stop in the tab's
                  history (replace), so back from either goes to the list. */}
              <Link href={viewHref} replace className="flex h-10 items-center rounded-full border border-linear-hairline bg-linear-surface-1 px-4 text-[13px] font-bold text-linear-ink transition hover:bg-linear-surface-2">
                ดูหน้าผู้ใช้
              </Link>
              <GameinfoModeCloneButton gameId={row.id} currentMode={dataMode} />
              <GameinfoDatasetToggle basePath={gameinfoGameHref(lang, row.id, "uid", manageMode)} />
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 pb-28 pt-6 sm:px-7 lg:flex-row lg:items-start">
          <GameinfoManageNav sections={MANAGE_SECTIONS} />
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <GameinfoMissingChecklist items={missingItems} />
            {/* Keyed on the image and categories so "เติมจากเว็บ" filling them
                shows up in the form instead of its stale first state. */}
            <GameinfoGameManager key={`${row.image}|${(row.tags || []).join(",")}`} row={row} existingNames={existingNames} tagSuggestions={tagSuggestions} publisherSuggestions={publisherSuggestions} dataMode={dataMode} sectionNumbers={MANAGE_NUMBERS} />
            <GameinfoManageSection
              id="s-web"
              number={MANAGE_NUMBERS.web}
              title="เว็บ TopUp และข้อมูลลูกค้า"
              description="เกมนี้คือเกมไหนบนเว็บ สถานะ Web ON และช่องที่ลูกค้าต้องกรอก ดึงจากเว็บโดยตรง"
            >
              <GameinfoTopupWebPanel
                gameId={row.id}
                gameName={row.game}
                region={row.region}
                connected={topupConnected}
                topupGame={topupGame}
                topupGameId={settings.topupGameId}
                adminUrl={topupWebAdminUrl()}
                dataMode={dataMode}
                fillPreview={fillPreview}
                missingPacks={missingPacks}
                packImageFills={packImageFills}
              />
            </GameinfoManageSection>
            <GameinfoManageSection
              id="s-test"
              number={MANAGE_NUMBERS.test}
              title="บัญชีทดสอบ"
              description="ใช้ทดสอบเติมก่อนเปิด Web ON หรือหลังแก้ Bot · ห้ามใช้บัญชีลูกค้าจริง"
            >
              <GameinfoTestAccounts gameId={row.id} initialAccounts={testAccounts} />
            </GameinfoManageSection>
            <GameinfoPackEditor
              key={dataMode}
              game={packGame}
              userId={user.id}
              suggestions={{ ...buildPackSuggestions(packGame), channels: allChannels }}
              dataMode={dataMode}
              backHref={listHref}
              historyUrl={`/api/gameinfo/gamelist/${row.id}/packs/history?limit=200${dataMode === "idpass" ? "&mode=idpass" : ""}`}
              savePacksUrl={`/api/gameinfo/gamelist/${row.id}/packs${dataMode === "idpass" ? "?mode=idpass" : ""}`}
              importPreviewUrl={`/api/gameinfo/import/preview?gameId=${row.id}`}
              exportUrl={`/api/gameinfo/import/export?gameId=${row.id}${dataMode === "idpass" ? "&mode=idpass" : ""}`}
              sectionNumbers={MANAGE_NUMBERS}
            />
            <GameinfoManageSection
              id="s-margin"
              number={MANAGE_NUMBERS.margin}
              title="ราคาเว็บและ Margin"
              description={`ราคาขายและกำไรต่อชิ้นบนเว็บ TopUp (${dataMode === "idpass" ? "ID-PASS" : "UID"}) เทียบกับต้นทุนที่เว็บบันทึกไว้`}
            >
              {topupGame ? (
                <GameinfoWebMargin packages={topupGame.packages} dataMode={dataMode} usdThb={usdThb} gameinfoPacks={gameinfoPacks} />
              ) : (
                <p className="text-sm text-linear-ink-tertiary">เชื่อมเกมกับเว็บ TopUp ในหัวข้อ {MANAGE_NUMBERS.web} ก่อน</p>
              )}
            </GameinfoManageSection>
            <GameinfoManageSection
              id="s-sales"
              number={MANAGE_NUMBERS.sales}
              title="ช่องทางขาย / Margin"
              description="สถานะขาย ผลเทียบราคาตลาด และ Margin ของแต่ละช่องทาง — มุมมอง Topup ไม่เห็น Margin"
            >
              <GameinfoSalesChannelEditor gameId={row.id} initialChannels={salesChannels} />
            </GameinfoManageSection>
            {/* Reports on the manage page are always resolvable: whoever
                reaches it is an editor. */}
            <GameinfoReportPanel gameId={row.id} initialReports={reports} canManage canReport id="s-report" number={MANAGE_NUMBERS.report} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {/* Rendered here, not in the layout: a layout is not re-rendered on a
        client-side navigation, so its bar kept showing the view the first
        page was opened in. */}
    <GameinfoViewSwitch savedView={view} isAdmin={editableRole} />
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <GameinfoBackLink
          className="flex h-10 items-center gap-1.5 rounded-full border border-linear-hairline bg-linear-surface-1 px-4 text-[13px] font-bold text-linear-ink transition hover:bg-linear-surface-2"
          href={listHref}
        />
        <GameinfoDatasetToggle basePath={gameinfoGameHref(lang, row.id, "uid", false)} />
      </div>
      <GameinfoGameView
        key={dataMode}
        row={row}
        currencies={currencies}
        computedColumns={computedColumns}
        costProfiles={costProfiles}
        formulaVariables={formulaVariables}
        userId={user.id}
        dataMode={dataMode}
        hiddenColumnKeys={hiddenColumnKeys}
        editHref={editableRole ? manageHref : null}
        stock={stock}
        stockLinks={hasPermission(user, "stock.access")}
        costRatesOther={costRatesOther}
        columnOrder={columnOrder}
      />
      <div className="mt-5">
        <GameinfoSalesChannelCards channels={salesChannels} showMargin={!topupView} />
      </div>
      <div className="mt-5">
        <GameinfoTestAccountsCard
          gameId={row.id}
          accounts={editableRole ? testAccounts : testAccounts.map(maskGamelistTestAccount)}
          canReveal={editableRole}
        />
      </div>
      <GameinfoReportPanel gameId={row.id} initialReports={reports} canManage={editableRole} canReport={canReport} />
    </div>
    </>
  );
}

// The manage page's cards in page order; the nav numbers them the same way.
const MANAGE_SECTIONS = [
  { id: "s-info", label: "ข้อมูลเกม" },
  { id: "s-method", label: "วิธีเติมและคำแนะนำ" },
  { id: "s-web", label: "เว็บและข้อมูลลูกค้า" },
  { id: "s-test", label: "บัญชีทดสอบ" },
  { id: "s-cost", label: "ต้นทุนและเรต" },
  { id: "s-pack", label: "แพ็คและราคา" },
  { id: "s-margin", label: "ราคาเว็บและ Margin" },
  { id: "s-sales", label: "ช่องทางขาย" },
  { id: "s-report", label: "รายงานปัญหา" },
];
const MANAGE_NUMBERS = { info: 1, method: 2, web: 3, test: 4, cost: 5, pack: 6, margin: 7, sales: 8, report: 9 };
