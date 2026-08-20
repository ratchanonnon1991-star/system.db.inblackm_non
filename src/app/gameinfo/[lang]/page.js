import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
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

export const metadata = {
  title: "GameDB — GameInfo",
};

// Direct edit view of Topup Panel's `game_list` — see
// src/server/gameinfo-gamelist.js. staff/admin can edit inline right here;
// role "user" gets the same table read-only. No separate admin page.
export default async function GameinfoHomePage({ params, searchParams }) {
  const { lang } = await params;
  const { view, mode: rawMode } = await searchParams;
  const dataMode = normalizeGameinfoDataMode(rawMode);
  const user = await getSessionUser();
  if (!user) redirect("/");
  const editableRole = user.role === "admin" || user.role === "staff";
  // ?view=1 lets an admin/staff user manually preview the read-only view
  // (toggled from the "หน้าเว็บ" nav button, see GameinfoModeToggle) — role
  // "user" never gets a toggle, so this can't grant edit access either way.
  const editable = editableRole && view !== "1";

  let rows = null;
  let loadError = null;
  try {
    const [gameListRows, channelsByGame, vpnByGame, packCountByGame, packServiceByGame, tutorialPresence, warningPresence, imageByGame, linksByGame] =
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
      ]);
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
      serviceStatus: r.serviceNew
        ? "new"
        : !r.serviceEnabled
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
      });
    });
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  if (!editable && !loadError) {
    return <GameinfoGamelistCards initial={rows} lang={lang} dataMode={dataMode} />;
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
          editable={editable}
          lang={lang}
          dataMode={dataMode}
        />
      )}
    </div>
  );
}
