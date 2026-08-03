import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { findUserById } from "@/server/users-repository";
import { getGameinfoGame } from "@/server/gameinfo-games";
import GameinfoGameView from "@/components/gameinfo-game-view";

export const metadata = {
  title: "GameDB — รายละเอียดเกม",
};

export default async function GameinfoGamePage({ params }) {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const user = session?.sub ? await findUserById(session.sub) : null;
  if (!user) redirect("/");

  const { id } = await params;
  const game = await getGameinfoGame(Number(id));
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-indigo-600 hover:underline"
      >
        ← กลับหน้า GameDB
      </Link>
      <GameinfoGameView game={game} />
    </div>
  );
}
