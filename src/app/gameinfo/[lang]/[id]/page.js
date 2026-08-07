import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/server/session-user";
import { getGameinfoGame } from "@/server/gameinfo-games";
import GameinfoGameView from "@/components/gameinfo-game-view";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";

export const metadata = {
  title: "GameDB — รายละเอียดเกม",
};

export default async function GameinfoGameDetailPage({ params }) {
  const { lang, id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");

  let game;
  try {
    game = await getGameinfoGame(Number(id));
  } catch (err) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href={`/gameinfo/${lang}`}
        className="mb-4 inline-block text-sm text-indigo-600 hover:underline"
      >
        ← กลับหน้า GameInfo
      </Link>
      <GameinfoGameView game={game} />
    </div>
  );
}
