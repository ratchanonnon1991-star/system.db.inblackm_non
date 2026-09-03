import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess } from "@/server/auth";
import { getRussiaCheckGameLog } from "@/server/gameinfo-russia-check";
import GameinfoRussiaCheckGameLogsPage from "@/components/gameinfo-russia-check-game-logs-page";

export const metadata = { title: "GameInfo — Log รายเกม Russia Check" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const log = await getRussiaCheckGameLog();
  return <GameinfoRussiaCheckGameLogsPage initialLog={log} lang={lang} />;
}
