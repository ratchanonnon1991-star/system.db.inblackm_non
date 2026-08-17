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
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";

export const metadata = {
  title: "GameDB — GameInfo",
};

// Direct edit view of Topup Panel's `game_list` — see
// src/server/gameinfo-gamelist.js. staff/admin can edit inline right here;
// role "user" gets the same table read-only. No separate admin page.
export default async function GameinfoHomePage({ params, searchParams }) {
  const { lang } = await params;
  const { view } = await searchParams;
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
    rows = gameListRows.map((r) => ({
      ...r,
      channels: channelsByGame[r.id] || { main: [], secondary: [] },
      vpnComputed: vpnByGame[r.id] ? "YES" : "NO",
      packCount: packCountByGame[r.id] || 0,
      packDisabledCount: packServiceByGame[r.id]?.disabled || 0,
      serviceStatus: r.serviceNew
        ? "new"
        : !r.serviceEnabled
        ? "offline"
        : (packServiceByGame[r.id]?.disabled || 0) > 0
          ? "partial"
          : "online",
      hasTutorial: Boolean(tutorialPresence[r.id]),
      hasWarning: Boolean(warningPresence[r.id]),
      image: imageByGame[r.id] || "",
      links: Object.prototype.hasOwnProperty.call(linksByGame, r.id)
        ? linksByGame[r.id]
        : legacyGamelistLinks(r.link),
    }));
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-linear-ink">GameInfo</h1>
      {loadError ? (
        <GameinfoErrorNotice message={loadError} />
      ) : (
        <GameinfoGamelistTable initial={rows} editable={editable} lang={lang} />
      )}
    </div>
  );
}
