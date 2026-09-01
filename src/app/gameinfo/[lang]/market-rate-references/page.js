import { redirect } from "next/navigation";
import { canManageGameinfo, hasGameinfoAccess } from "@/server/auth";
import { getSessionUser } from "@/server/session-user";
import { countActiveGameinfoPriceAlerts, listGameinfoMarketRateReferenceOptions } from "@/server/gameinfo-market-system";
import GameinfoMarketRateReferencesPage from "@/components/gameinfo-market-rate-references-page";
import GameinfoMarketShell from "@/components/gameinfo-market-shell";

export const metadata = { title: "GameInfo — เวลาอ้างอิงเรท" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const [markets, alertCount] = await Promise.all([
    listGameinfoMarketRateReferenceOptions(),
    countActiveGameinfoPriceAlerts(),
  ]);
  return <GameinfoMarketShell lang={lang} active="rate-references" alertCount={alertCount}>
    <GameinfoMarketRateReferencesPage initialMarkets={markets} canManage={canManageGameinfo(user)} />
  </GameinfoMarketShell>;
}
