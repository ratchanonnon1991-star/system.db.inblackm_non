import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { listGameinfoGames } from "@/server/gameinfo-games";
import GameinfoGamesTable from "@/components/gameinfo-games-table";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";

export const metadata = {
  title: "GameDB — จัดการ GameInfo",
};

function toRow(game) {
  const main = new Set();
  const secondary = new Set();
  let packCount = 0;
  for (const c of game.currencies || []) {
    for (const cat of c.categories || []) {
      for (const p of cat.packs || []) {
        packCount += 1;
        (p.channelsMain || []).forEach((ch) => main.add(ch));
        (p.channelsSecondary || []).forEach((ch) => secondary.add(ch));
      }
    }
  }
  return {
    id: game.id,
    gameName: game.gameName,
    region: game.region,
    platform: game.platform,
    server: game.server,
    vpn: game.vpn,
    webTopup: game.webTopup,
    image: game.image,
    packCount,
    mainChannels: Array.from(main),
    secondaryChannels: Array.from(secondary),
  };
}

export default async function GameinfoAdminPage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role === "user") redirect(`/gameinfo/${lang}`);

  let games = [];
  let loadError = null;
  try {
    games = await listGameinfoGames();
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">จัดการ GameInfo</h1>
      {loadError ? (
        <GameinfoErrorNotice message={loadError} />
      ) : (
        <GameinfoGamesTable initial={games.map(toRow)} lang={lang} />
      )}
    </div>
  );
}
