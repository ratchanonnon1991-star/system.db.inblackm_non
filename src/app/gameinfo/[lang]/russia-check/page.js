import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess } from "@/server/auth";
import { hasPermission } from "@/lib/permissions";
import { getRussiaCheckDashboard, listRussiaCheckLogs } from "@/server/gameinfo-russia-check";
import GameinfoRussiaCheckPage from "@/components/gameinfo-russia-check-page";

export const metadata = { title: "GameInfo — Russia Check" };

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function Page({ params, searchParams }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const rawGameId = (await searchParams)?.gameId;
  const gameId = rawGameId == null || rawGameId === "" || rawGameId === "all" ? null : Number(rawGameId);
  if (gameId !== null && (typeof rawGameId !== "string" || !/^\d+$/.test(rawGameId) || !Number.isSafeInteger(gameId) || gameId <= 0 || gameId > 2147483647)) notFound();
  const [dashboard, logs] = await Promise.all([getRussiaCheckDashboard({ gameId }), listRussiaCheckLogs({ gameId, date: gameId === null ? "" : bangkokToday() })]);
  if (gameId !== null && !dashboard.games.some((item) => item.gameId === gameId)) notFound();
  return <GameinfoRussiaCheckPage key={gameId ?? "all"} initialGameId={gameId} initialDashboard={dashboard} initialLogs={logs} canRefresh={hasPermission(user, "gameinfo.market_check")} canManage={hasPermission(user, "gameinfo.admin")} lang={lang} />;
}
