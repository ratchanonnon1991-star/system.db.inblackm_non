import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo } from "@/server/auth";
import { listGameListRows } from "@/server/gameinfo-gamelist";
import {
  listGamelistChannelsByGame,
  listGamelistPackCountByGame,
  listGamelistPackServiceByGame,
  listGamelistVpnByGame,
} from "@/server/gameinfo-gamelist-packs";
import {
  listGamelistTutorialPresence,
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
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { listGameinfoModeData } from "@/server/gameinfo-mode-data";
import { listGamelistTagsByGame } from "@/server/gameinfo-gamelist-tags";
import { listOpenGamelistReports } from "@/server/gameinfo-gamelist-reports";
import { listGamelistFavoriteIds } from "@/server/gameinfo-gamelist-favorites";

export const metadata = {
  title: "GameDB — GameInfo",
};

// Everyone lands on the card dashboard. Topup and role "user" stay read-only.
export default async function GameinfoHomePage({ params, searchParams }) {
  const { lang } = await params;
  const { manage, mode: rawMode } = await searchParams;
  const dataMode = normalizeGameinfoDataMode(rawMode);
  const user = await getSessionUser();
  if (!user) redirect("/");
  const editableRole = canManageGameinfo(user);
  const manageMode = editableRole && manage === "1";

  let rows = null;
  let reports = [];
  let loadError = null;
  try {
    const [gameListRows, channelsByGame, vpnByGame, packCountByGame, packServiceByGame, tutorialPresence, warningPresence, imageByGame, linksByGame, tagsByGame, openReports, favoriteIds] =
      await Promise.all([
        listGameListRows(),
        listGamelistChannelsByGame(),
        listGamelistVpnByGame(),
        listGamelistPackCountByGame(),
        listGamelistPackServiceByGame(),
        listGamelistTutorialPresence(),
        listGamelistWarningPresence(),
        listGamelistImageByGame(),
        listGamelistLinksByGame(),
        listGamelistTagsByGame(),
        listOpenGamelistReports(),
        listGamelistFavoriteIds(user.id),
      ]);
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
      vpnComputed: dataMode === "idpass" ? (flatModePacks.some((pack) => pack.country) ? "YES" : "NO") : vpnByGame[r.id] ? "YES" : "NO",
      packCount: dataMode === "idpass" ? flatModePacks.length : packCountByGame[r.id] || 0,
      packDisabledCount: disabledPackCount,
      serviceStatus: !r.serviceEnabled
        ? "offline"
        : disabledPackCount > 0
          ? "partial"
          : "online",
      hasTutorial: dataMode === "idpass" ? Boolean(modeData?.tutorial?.categories?.some((category) => category.steps?.length)) : Boolean(tutorialPresence[r.id]),
      hasWarning: dataMode === "idpass" ? Boolean(modeData?.warning?.categories?.some((category) => category.steps?.length)) : Boolean(warningPresence[r.id]),
      image: imageByGame[r.id] || "",
      links: dataMode === "idpass" ? modeData?.links || [] : Object.prototype.hasOwnProperty.call(linksByGame, r.id)
        ? linksByGame[r.id]
        : legacyGamelistLinks(r.link),
      tags: tagsByGame[r.id] || [],
      reportCount: reportCountByGame[r.id] || 0,
      isFavorite: favoriteIdSet.has(r.id),
      });
    });
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  if (!manageMode && !loadError) {
    return <GameinfoGamelistCards initial={rows} initialReports={reports} editable={editableRole} lang={lang} dataMode={dataMode} />;
  }

  return (
    <div className="px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-linear-ink">GameInfo</h1>
        <GameinfoDatasetToggle basePath={`/gameinfo/${lang}`} />
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
