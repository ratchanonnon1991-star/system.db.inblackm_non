import { notFound, redirect } from "next/navigation";
import Link from "next/link";
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
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";
import GameinfoBackLink from "@/components/gameinfo-back-link";
import GameinfoDatasetToggle from "@/components/gameinfo-dataset-toggle";
import { gameinfoGameHref, gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData } from "@/server/gameinfo-mode-data";
import GameinfoModeCloneButton from "@/components/gameinfo-mode-clone-button";
import GameinfoGameManager from "@/components/gameinfo-game-manager";
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

export default async function GameinfoGameDetailPage({ params, searchParams, manage = false }) {
  const { lang, id } = await params;
  const { mode: rawMode } = await searchParams;
  const dataMode = normalizeGameinfoDataMode(rawMode);
  const user = await getSessionUser();
  if (!user) redirect("/");
  const editableRole = canManageGameinfo(user);
  const canReport = hasPermission(user, "gameinfo.report");
  if (manage && !editableRole) redirect(gameinfoGameHref(lang, id, dataMode));
  const manageMode = manage && editableRole;

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
  try {
    row = await getGameListRow(numericId);
    if (row) {
      const modeData = dataMode === "idpass" ? await getGameinfoModeData(row.id, dataMode) : null;
      const packs = modeData?.packs || await getGamelistPacks(row.id);
      currencies = packs.currencies;
      computedColumns = packs.computedColumns;
      costProfiles = packs.costProfiles;
      const packDisabledCount = currencies.reduce(
        (total, currency) => total + currency.categories.reduce(
          (categoryTotal, category) => categoryTotal + category.packs.filter((pack) => pack.serviceEnabled === false).length,
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
      const [channelsByGame, allRows, tutorial, warning, vpnNote, image, storedLinks, variableData, tagsByGame, publishersByGame, loadedReports, sharedChannels, languages, loadedTagImages, loadedPublisherImages] = await Promise.all([
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
        warningAutoOpen: Boolean(warning.autoOpen),
        warningRevision: warning.revision || "legacy",
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
    }
  } catch (err) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!row) notFound();

  const viewHref = gameinfoGameHref(lang, row.id, dataMode);
  const manageHref = gameinfoGameHref(lang, row.id, dataMode, true);
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
  };

  return (
    <div className={`${manageMode ? "" : "mx-auto max-w-7xl"} px-4 py-8`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <GameinfoBackLink
          className="flex items-center gap-1 text-sm text-linear-primary hover:underline"
          href={manageMode ? viewHref : gameinfoListHref(lang, dataMode)}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editableRole ? (
            <Link href={manageMode ? viewHref : manageHref} className="rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2">
              {manageMode ? "ดูหน้าผู้ใช้" : "จัดการเกม"}
            </Link>
          ) : null}
          {manageMode ? <GameinfoModeCloneButton gameId={row.id} currentMode={dataMode} /> : null}
          <GameinfoDatasetToggle basePath={gameinfoGameHref(lang, row.id, "uid", manageMode)} />
        </div>
      </div>
      {manageMode ? <GameinfoGameManager row={row} existingNames={existingNames} tagSuggestions={tagSuggestions} publisherSuggestions={publisherSuggestions} dataMode={dataMode} /> : null}
      {manageMode ? <GameinfoReportPanel gameId={row.id} initialReports={reports} canManage canReport /> : null}
      {manageMode ? (
        <section className="mt-8 border-t border-linear-hairline pt-6" aria-labelledby="pack-editor-title">
          <h2 id="pack-editor-title" className="mb-4 text-lg font-semibold tracking-[-0.2px] text-linear-ink">แก้ไข Pack</h2>
          <GameinfoPackEditor
            key={dataMode}
            game={packGame}
            userId={user.id}
            suggestions={{ ...buildPackSuggestions(packGame), channels: allChannels }}
            dataMode={dataMode}
            backHref={viewHref}
            historyUrl={`/api/gameinfo/gamelist/${row.id}/packs/history?limit=200${dataMode === "idpass" ? "&mode=idpass" : ""}`}
            savePacksUrl={`/api/gameinfo/gamelist/${row.id}/packs${dataMode === "idpass" ? "?mode=idpass" : ""}`}
            importPreviewUrl={`/api/gameinfo/import/preview?gameId=${row.id}`}
            exportUrl={`/api/gameinfo/import/export?gameId=${row.id}${dataMode === "idpass" ? "&mode=idpass" : ""}`}
          />
        </section>
      ) : (
        <>
          <GameinfoGameView
            key={dataMode}
            row={row}
            currencies={currencies}
            computedColumns={computedColumns}
            costProfiles={costProfiles}
            formulaVariables={formulaVariables}
            userId={user.id}
            dataMode={dataMode}
          />
          <GameinfoReportPanel gameId={row.id} initialReports={reports} canManage={editableRole} canReport={canReport} />
        </>
      )}
    </div>
  );
}
