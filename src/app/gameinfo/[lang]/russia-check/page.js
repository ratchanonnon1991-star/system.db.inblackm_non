import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess } from "@/server/auth";
import { hasPermission } from "@/lib/permissions";
import { getRussiaCheckDashboard, listRussiaCheckLogs } from "@/server/gameinfo-russia-check";
import GameinfoRussiaCheckPage from "@/components/gameinfo-russia-check-page";

export const metadata = { title: "GameInfo — Russia Check" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const [dashboard, logs] = await Promise.all([getRussiaCheckDashboard(), listRussiaCheckLogs()]);
  return <GameinfoRussiaCheckPage initialDashboard={dashboard} initialLogs={logs} canRefresh={hasPermission(user, "gameinfo.market_check")} canManage={hasPermission(user, "gameinfo.admin")} lang={lang} />;
}
