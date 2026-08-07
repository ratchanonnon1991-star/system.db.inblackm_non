import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { listGameinfoGames } from "@/server/gameinfo-games";
import GameinfoGameList from "@/components/gameinfo-game-list";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";

export const metadata = {
  title: "GameDB — GameInfo",
};

export default async function GameinfoHomePage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");

  let games = [];
  let loadError = null;
  try {
    games = await listGameinfoGames();
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  const canEdit = user.role !== "user";

  return (
    <div className="px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">GameInfo</h1>
      {loadError ? (
        <GameinfoErrorNotice message={loadError} />
      ) : (
        <GameinfoGameList games={games} lang={lang} canEdit={canEdit} />
      )}
    </div>
  );
}
