import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo, hasGameinfoAccess } from "@/server/auth";
import { countActiveGameinfoPriceAlerts, listGameinfoOwnSellers } from "@/server/gameinfo-market-system";
import { normalizeMarketIdentityPart } from "@/lib/gameinfo-market-system";
import { fetchItemkuPage, itemkuGameUrl, loadItemkuGames, normalizeItemkuGame, normalizeItemkuGroup } from "@/server/itemku-prices";
import { fetchKaleozPage, kaleozGameUrl, loadKaleozGames, normalizeKaleozGame, normalizeKaleozProductType } from "@/server/kaleoz-zepeto";
import { fetchG2GPage, g2gGameUrl, loadG2GGames, normalizeG2GGame, normalizeG2GGroup } from "@/server/g2g-prices";
import GameinfoMarketShell from "@/components/gameinfo-market-shell";
import GameinfoPackPriceCompare from "@/components/gameinfo-pack-price-compare";

export const metadata = { title: "GameInfo — เทียบราคากับร้านอื่น" };

export default async function Page({ params, searchParams }) {
  const { lang } = await params;
  const query = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasGameinfoAccess(user)) redirect(`/gameinfo/${lang}`);
  const providers = {
    kaleoz: { label: "Kaleoz", loadGames: loadKaleozGames, normalizeGame: normalizeKaleozGame, normalizeGroup: normalizeKaleozProductType, fetchPage: fetchKaleozPage, gameUrl: kaleozGameUrl, fallbackSlug: "zepeto" },
    itemku: { label: "itemku", loadGames: loadItemkuGames, normalizeGame: normalizeItemkuGame, normalizeGroup: normalizeItemkuGroup, fetchPage: fetchItemkuPage, gameUrl: itemkuGameUrl, fallbackSlug: "zepeto" },
    g2g: { label: "G2G", loadGames: loadG2GGames, normalizeGame: normalizeG2GGame, normalizeGroup: normalizeG2GGroup, fetchPage: fetchG2GPage, gameUrl: g2gGameUrl, fallbackSlug: "zepeto-top-up" },
  };
  const provider = Object.hasOwn(providers, query.market) ? query.market : "kaleoz";
  const adapter = providers[provider];
  const games = await adapter.loadGames();
  const gameConfig = adapter.normalizeGame(query.game, games);
  const productType = adapter.normalizeGroup(query.unit);
  const [loadedPage, ownSellers, alertCount] = await Promise.all([
    adapter.fetchPage(gameConfig?.value, productType).catch((error) => ({
      provider,
      providerLabel: adapter.label,
      error: error.message || `โหลด ${adapter.label} ไม่สำเร็จ`,
      groups: [],
      offers: [],
      game: gameConfig?.value,
      gameLabel: gameConfig?.label,
      sourceUrl: adapter.gameUrl(gameConfig?.slug || adapter.fallbackSlug),
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
