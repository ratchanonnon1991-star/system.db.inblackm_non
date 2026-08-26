import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo } from "@/server/auth";
import { listGameListRows } from "@/server/gameinfo-gamelist";
import {
  listGamelistChannelsByGame,
  listGamelistPackCountByGame,
  listGamelistPackServiceByGame,
} from "@/server/gameinfo-gamelist-packs";
import {
  listGamelistTutorialPresence,
  listGamelistVpnNotePresence,
  listGamelistWarningPresence,
} from "@/server/gameinfo-gamelist-tutorial";
import { listGamelistImageByGame } from "@/server/gameinfo-gamelist-image";
import {
  legacyGamelistLinks,
  listGamelistLinksByGame,
} from "@/server/gameinfo-gamelist-links";
import GameinfoGamelistTable from "@/components/gameinfo-gamelist-table";
import GameinfoGamelistCards from "@/components/gameinfo-gamelist-cards";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";
import GameinfoDatasetToggle from "@/components/gameinfo-dataset-toggle";
import { gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { listGameinfoModeData } from "@/server/gameinfo-mode-data";
import {
  listGamelistPublisherImages,
  listGamelistPublishersByGame,
  listGamelistTagImages,
  listGamelistTagsByGame,
} from "@/server/gameinfo-gamelist-tags";
import { listOpenGamelistReports } from "@/server/gameinfo-gamelist-reports";
import { listGamelistFavoriteIds } from "@/server/gameinfo-gamelist-favorites";
import { hasPermission } from "@/lib/permissions";
import {
  listGameinfoBotCategoryImages,
  listGameinfoBotChannels,
} from "@/server/gameinfo-bot-channels";
import { KALEOZ_GAMES, fetchKaleozPage, normalizeKaleozGame, normalizeKaleozProductType } from "@/server/kaleoz-zepeto";

// Everyone lands on the card dashboard. Topup and role "user" stay read-only.
export default async function GameinfoHomePage({ params, searchParams, manage = false }) {
  const { lang } = await params;
  const { mode: rawMode, view: rawView, section, game, unit } = await searchParams;
  const kaleozGame = normalizeKaleozGame(game);
  const kaleozGameConfig = KALEOZ_GAMES.find((item) => item.value === kaleozGame);
  const kaleozProductType = normalizeKaleozProductType(unit);
  const dataMode = normalizeGameinfoDataMode(rawMode);
  const user = await getSessionUser();
  if (!user) redirect("/");
  const editableRole = canManageGameinfo(user);
  const canReport = hasPermission(user, "gameinfo.report");
  if (manage && !editableRole) redirect(gameinfoListHref(lang, dataMode));
  const manageMode = manage && editableRole;
  const topupView = !manageMode && rawView === "topup";

  let rows = null;
  let reports = [];
  let tagImages = {};
  let publisherImages = {};
  let botChannels = [];
  let botCategoryImages = {};
  let kaleozPage = null;
  let loadError = null;
  try {
    const [gameListRows, channelsByGame, packCountByGame, packServiceByGame, tutorialPresence, warningPresence, vpnNotePresence, imageByGame, linksByGame, tagsByGame, publishersByGame, loadedTagImages, loadedPublisherImages, openReports, favoriteIds, loadedBotChannels, loadedBotCategoryImages, loadedKaleozPage] =
      await Promise.all([
        listGameListRows(),
        listGamelistChannelsByGame(),
        listGamelistPackCountByGame(),
        listGamelistPackServiceByGame(),
        listGamelistTutorialPresence(),
        listGamelistWarningPresence(),
        listGamelistVpnNotePresence(),
        listGamelistImageByGame(),
        listGamelistLinksByGame(),
        listGamelistTagsByGame(),
        listGamelistPublishersByGame(),
        listGamelistTagImages(),
        listGamelistPublisherImages(),
        listOpenGamelistReports(),
        listGamelistFavoriteIds(user.id),
        section === "game-bot-auto" ? listGameinfoBotChannels() : [],
        section === "game-bot-auto" ? listGameinfoBotCategoryImages() : {},
        section === "pack-price-compare"
          ? fetchKaleozPage(kaleozGame, kaleozProductType).catch((error) => ({
            error: error.message || "โหลด Kaleoz ไม่สำเร็จ",
            groups: [],
            offers: [],
            game: kaleozGame,
            gameLabel: kaleozGameConfig?.label,
            sourceUrl: `https://www.kaleoz.com/buy/${kaleozGameConfig?.slug || "zepeto"}?page=1`,
            games: KALEOZ_GAMES.map(({ value, label, available = true }) => ({ value, label, available })),
            productType: kaleozProductType,
          }))
          : null,
      ]);
    tagImages = loadedTagImages;
    publisherImages = loadedPublisherImages;
    botChannels = loadedBotChannels;
    botCategoryImages = loadedBotCategoryImages;
    kaleozPage = loadedKaleozPage;
    const favoriteIdSet = new Set(favoriteIds);
    const reportCountByGame = openReports.reduce((counts, report) => {
      counts[report.gameId] = (counts[report.gameId] || 0) + 1;
      return counts;
    }, {});
    reports = openReports;
    const modeDataByGame = dataMode === "idpass" ? await listGameinfoModeData(dataMode) : {};
    rows = gameListRows.map((r) => {
      const modeData = modeDataByGame[r.id];
      const modeFields = modeData?.fields || {
        region: "",
        platform: "",
        server: "",
        botManual: "",
      };
      const modePacks = modeData?.packs?.currencies || [];
      const flatModePacks = modePacks.flatMap((currency) => currency.categories.flatMap((category) => category.packs));
      const modeChannels = {
        main: [...new Set(flatModePacks.flatMap((pack) => pack.channelsMain || []))],
        secondary: [...new Set(flatModePacks.flatMap((pack) => pack.channelsSecondary || []))],
      };
      const disabledPackCount = dataMode === "idpass"
        ? flatModePacks.filter((pack) => pack.serviceEnabled === false).length
        : packServiceByGame[r.id]?.disabled || 0;
      return ({
      ...r,
      ...(dataMode === "idpass" ? modeFields : {}),
      channels: dataMode === "idpass" ? modeChannels : channelsByGame[r.id] || { main: [], secondary: [] },
      packCount: dataMode === "idpass" ? flatModePacks.length : packCountByGame[r.id] || 0,
      packDisabledCount: disabledPackCount,
      serviceStatus: !r.serviceEnabled
        ? "offline"
        : disabledPackCount > 0
          ? "partial"
          : "online",
      hasTutorial: dataMode === "idpass" ? Boolean(modeData?.tutorial?.categories?.some((category) => category.steps?.length)) : Boolean(tutorialPresence[r.id]),
      hasWarning: dataMode === "idpass" ? Boolean(modeData?.warning?.categories?.some((category) => category.steps?.length)) : Boolean(warningPresence[r.id]),
      hasVpnNote: Boolean(vpnNotePresence[r.id]),
      image: imageByGame[r.id] || "",
      links: dataMode === "idpass" ? modeData?.links || [] : Object.prototype.hasOwnProperty.call(linksByGame, r.id)
        ? linksByGame[r.id]
        : legacyGamelistLinks(r.link),
      tags: tagsByGame[r.id] || [],
      publishers: publishersByGame[r.id] || [],
      reportCount: reportCountByGame[r.id] || 0,
      isFavorite: favoriteIdSet.has(r.id),
      });
    });
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  if (!manageMode && !loadError) {
    return <GameinfoGamelistCards initial={rows} initialReports={reports} tagImages={tagImages} publisherImages={publisherImages} botChannels={botChannels} botCategoryImages={botCategoryImages} kaleozPage={kaleozPage} botCatalogActive={section === "game-bot-auto"} priceComparisonActive={section === "pack-price-compare"} editable={editableRole && !topupView} topupView={topupView} canReport={canReport} lang={lang} dataMode={dataMode} />;
  }

  return (
    <div className="px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-linear-ink">GameInfo</h1>
        <GameinfoDatasetToggle basePath={gameinfoListHref(lang, "uid", manageMode, topupView)} />
      </div>
      {loadError ? (
        <GameinfoErrorNotice message={loadError} />
      ) : (
        <GameinfoGamelistTable
          key={dataMode}
          initial={rows}
          editable={editableRole}
          lang={lang}
          dataMode={dataMode}
        />
      )}
    </div>
  );
}
