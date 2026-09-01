import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess } from "@/server/auth";
import { hasPermission } from "@/lib/permissions";
import { countActiveGameinfoPriceAlerts, countEnabledGameinfoMarkets, listGameinfoOwnSellers, listLatestGameinfoMarketCheckRuns } from "@/server/gameinfo-market-system";
import GameinfoMarketShell from "@/components/gameinfo-market-shell";
import GameinfoMarketChecksPage from "@/components/gameinfo-market-checks-page";

export const metadata = { title: "GameInfo — Market Check" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const [sellers, alertCount, runs, enabledCounts] = await Promise.all([listGameinfoOwnSellers(), countActiveGameinfoPriceAlerts(), listLatestGameinfoMarketCheckRuns(), countEnabledGameinfoMarkets()]);
  return <GameinfoMarketShell lang={lang} active="checks" alertCount={alertCount}><GameinfoMarketChecksPage initialSellers={sellers} initialRuns={runs} enabledCounts={enabledCounts} canCheck={hasPermission(user, "gameinfo.market_check")} canManage={hasPermission(user, "gameinfo.admin")} /></GameinfoMarketShell>;
}
