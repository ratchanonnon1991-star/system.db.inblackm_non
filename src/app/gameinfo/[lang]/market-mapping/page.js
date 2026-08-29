import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess, canManageGameinfo } from "@/server/auth";
import { countActiveGameinfoPriceAlerts, listGameinfoMarketsOverview } from "@/server/gameinfo-market-system";
import GameinfoMarketShell from "@/components/gameinfo-market-shell";
import GameinfoMarketMappingPage from "@/components/gameinfo-market-mapping-page";

export const metadata = { title: "GameInfo — Market Mapping" };

export default async function Page({ params, searchParams }) {
  const { lang } = await params;
  const mode = (await searchParams).mode === "idpass" ? "idpass" : "uid";
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const [games, alertCount] = await Promise.all([listGameinfoMarketsOverview(mode), countActiveGameinfoPriceAlerts()]);
  return <GameinfoMarketShell lang={lang} active="mapping" alertCount={alertCount}><GameinfoMarketMappingPage games={games} dataMode={mode} editable={canManageGameinfo(user)} /></GameinfoMarketShell>;
}
