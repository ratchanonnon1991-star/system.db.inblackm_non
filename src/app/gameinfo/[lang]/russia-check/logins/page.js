import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess } from "@/server/auth";
import { hasPermission } from "@/lib/permissions";
import { getRussiaCheckDashboard } from "@/server/gameinfo-russia-check";
import GameinfoRussiaCheckLoginsPage from "@/components/gameinfo-russia-check-logins-page";

export const metadata = { title: "GameInfo — Russia Check Login" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const dashboard = await getRussiaCheckDashboard();
  return <GameinfoRussiaCheckLoginsPage initialGames={dashboard.games.filter((game) => game.authRequired)} canManage={hasPermission(user, "gameinfo.admin")} lang={lang} />;
}
