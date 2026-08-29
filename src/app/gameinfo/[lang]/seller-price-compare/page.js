import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo, hasGameinfoAccess } from "@/server/auth";
import { countActiveGameinfoPriceAlerts, listGameinfoOwnSellers } from "@/server/gameinfo-market-system";
import { normalizeMarketIdentityPart } from "@/lib/gameinfo-market-system";
import { fetchItemkuPage, itemkuGameUrl, loadItemkuGames, normalizeItemkuGame, normalizeItemkuGroup } from "@/server/itemku-prices";
import { fetchKaleozPage, kaleozGameUrl, loadKaleozGames, normalizeKaleozGame, normalizeKaleozProductType } from "@/server/kaleoz-zepeto";
import GameinfoMarketShell from "@/components/gameinfo-market-shell";
import GameinfoPackPriceCompare from "@/components/gameinfo-pack-price-compare";

export const metadata = { title: "GameInfo — เทียบราคากับร้านอื่น" };

export default async function Page({ params, searchParams }) {
  const { lang } = await params;
  const query = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const provider = query.market === "itemku" ? "itemku" : "kaleoz";
  const games = provider === "itemku" ? await loadItemkuGames() : await loadKaleozGames();
  const gameConfig = provider === "itemku" ? normalizeItemkuGame(query.game, games) : normalizeKaleozGame(query.game, games);
  const productType = provider === "itemku" ? normalizeItemkuGroup(query.unit) : normalizeKaleozProductType(query.unit);
  const [loadedPage, ownSellers, alertCount] = await Promise.all([
    (provider === "itemku"
      ? fetchItemkuPage(gameConfig?.value, productType)
      : fetchKaleozPage(gameConfig?.value, productType)).catch((error) => ({
      provider,
      providerLabel: provider === "itemku" ? "itemku" : "Kaleoz",
      error: error.message || `โหลด ${provider === "itemku" ? "itemku" : "Kaleoz"} ไม่สำเร็จ`,
      groups: [],
      offers: [],
      game: gameConfig?.value,
      gameLabel: gameConfig?.label,
      sourceUrl: provider === "itemku" ? itemkuGameUrl(gameConfig?.slug || "zepeto") : kaleozGameUrl(gameConfig?.slug || "zepeto"),
      games,
      productType,
    })),
    listGameinfoOwnSellers(provider),
    countActiveGameinfoPriceAlerts(),
  ]);
  const availableSellerByKey = new Map((loadedPage.offers || []).map((offer) => [normalizeMarketIdentityPart(offer.seller), offer.seller]));
  const baselineSeller = ownSellers
    .filter((seller) => seller.enabled)
    .map((seller) => availableSellerByKey.get(seller.sellerKey))
    .find(Boolean) || "";
  const marketPage = { ...loadedPage, baselineSeller };
  return <GameinfoMarketShell lang={lang} active="competitors" alertCount={alertCount}><GameinfoPackPriceCompare page={marketPage} editable={canManageGameinfo(user)} title="เทียบร้านอื่น" /></GameinfoMarketShell>;
}
