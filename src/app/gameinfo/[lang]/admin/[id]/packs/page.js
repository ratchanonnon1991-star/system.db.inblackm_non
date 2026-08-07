import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { getGameinfoGame } from "@/server/gameinfo-games";
import { buildPackSuggestions } from "@/lib/gameinfo-suggestions";
import GameinfoPackEditor from "@/components/gameinfo-pack-editor";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";

export const metadata = {
  title: "GameDB — แพ็กเกม",
};

export default async function GameinfoAdminPacksPage({ params }) {
  const { lang, id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role === "user") redirect(`/gameinfo/${lang}`);

  let game;
  try {
    game = await getGameinfoGame(Number(id));
  } catch (err) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">แพ็ก — {game.gameName}</h1>
      <GameinfoPackEditor game={game} lang={lang} suggestions={buildPackSuggestions(game)} />
    </div>
  );
}
