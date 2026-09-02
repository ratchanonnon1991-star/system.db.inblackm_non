import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess } from "@/server/auth";
import { countActiveGameinfoPriceAlerts, listGameinfoMarketsOverview } from "@/server/gameinfo-market-system";
import GameinfoMarketShell from "@/components/gameinfo-market-shell";
import GameinfoMarketComparePage from "@/components/gameinfo-market-compare-page";

export const metadata = { title: "GameInfo — เทียบราคาแพ็ค" };

export default async function Page({ params, searchParams }) {
  const { lang } = await params;
  const query = await searchParams;
  const mode = query.mode === "idpass" ? "idpass" : "uid";
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const [games, alertCount] = await Promise.all([listGameinfoMarketsOverview(mode), countActiveGameinfoPriceAlerts()]);
  return <GameinfoMarketShell lang={lang} active="compare" alertCount={alertCount}><GameinfoMarketComparePage games={games} dataMode={mode} initialMarket={query.market} initialExternalGame={query.game} /></GameinfoMarketShell>;
}
