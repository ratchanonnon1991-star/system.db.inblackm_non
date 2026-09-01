import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasGameinfoAccess } from "@/server/auth";
import { hasPermission } from "@/lib/permissions";
import { countActiveGameinfoPriceAlerts, listGameinfoMarketsOverview, listGameinfoOwnSellers } from "@/server/gameinfo-market-system";
import GameinfoMarketShell from "@/components/gameinfo-market-shell";
import GameinfoPriceAlertsPage from "@/components/gameinfo-price-alerts-page";

export const metadata = { title: "GameInfo — Price Alerts" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const [games, alertCount, sellers] = await Promise.all([listGameinfoMarketsOverview("uid"), countActiveGameinfoPriceAlerts(), listGameinfoOwnSellers()]);
  return <GameinfoMarketShell lang={lang} active="alerts" alertCount={alertCount}><GameinfoPriceAlertsPage games={games} ownSellers={sellers} canAcknowledge={hasPermission(user, "gameinfo.market_check")} /></GameinfoMarketShell>;
}
