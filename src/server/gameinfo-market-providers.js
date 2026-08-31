import { fetchKaleozPage, loadKaleozGames } from "@/server/kaleoz-zepeto";
import { fetchItemkuPage, loadItemkuGames } from "@/server/itemku-prices";
import { fetchG2GPage, loadG2GGames } from "@/server/g2g-prices";
import { buildGameinfoOwnSellerReferenceGroups, normalizeGameinfoMarket, normalizeMarketPage } from "@/lib/gameinfo-market-system";
import { listGameinfoPricePageKeys } from "@/server/gameinfo-price-page-store";

const providers = {
  kaleoz: {
    listGames: loadKaleozGames,
    fetchPage: (game, productType, options) => fetchKaleozPage(game, productType, options),
  },
  itemku: {
    listGames: loadItemkuGames,
    fetchPage: (game, productType, options) => fetchItemkuPage(game, productType, options),
  },
  g2g: {
    listGames: loadG2GGames,
    fetchPage: (game, productType, options) => fetchG2GPage(game, productType, options),
  },
};

export function getGameinfoMarketProvider(market) {
  return providers[normalizeGameinfoMarket(market)];
}

export async function listGameinfoMarketGames(market) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const games = await providers[normalizedMarket].listGames();
  return (games || []).map((game) => ({
    value: String(game.value),
    label: String(game.label || game.value),
    slug: String(game.slug || game.value),
  }));
}

// The daily job for the compare page: every snapshot the page has ever stored is
// fetched again, one at a time so the markets are not hit in a burst, and each
// fetch writes the fresh page back over its snapshot.
export async function refreshGameinfoPricePages() {
  const result = { refreshed: 0, failed: 0 };
  for (const stored of await listGameinfoPricePageKeys()) {
    if (!Object.hasOwn(providers, stored.market)) continue;
    try {
      await providers[stored.market].fetchPage(stored.game, stored.productType || undefined, { force: true });
      result.refreshed += 1;
    } catch (error) {
      result.failed += 1;
      console.error(`[gameinfo-price-pages] refresh ${stored.market}/${stored.game} failed`, error);
    }
  }
  return result;
}

export async function fetchNormalizedGameinfoMarketCatalog(market, externalGameKey, productType = "", ownSellerNames = []) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const page = await providers[normalizedMarket].fetchPage(externalGameKey, productType || undefined, { force: true });
  return normalizeMarketPage(normalizedMarket, buildGameinfoOwnSellerReferenceGroups(normalizedMarket, page, ownSellerNames));
}
