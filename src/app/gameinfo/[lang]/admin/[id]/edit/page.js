import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { getGameinfoGame, listGameinfoGames } from "@/server/gameinfo-games";
import { buildGameSuggestions } from "@/lib/gameinfo-suggestions";
import GameinfoGameForm from "@/components/gameinfo-game-form";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";

export const metadata = {
  title: "GameDB — แก้ไขเกม",
};

export default async function GameinfoAdminEditPage({ params }) {
  const { lang, id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role === "user") redirect(`/gameinfo/${lang}`);

  let game;
  let games = [];
  try {
    game = await getGameinfoGame(Number(id));
    games = await listGameinfoGames();
  } catch (err) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">แก้ไขเกม — {game.gameName}</h1>
      <GameinfoGameForm lang={lang} initial={game} suggestions={buildGameSuggestions(games)} />
    </div>
  );
}
