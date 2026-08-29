import { fetchKaleozPage, loadKaleozGames } from "@/server/kaleoz-zepeto";
import { fetchItemkuPage, loadItemkuGames } from "@/server/itemku-prices";
import { buildGameinfoOwnSellerReferenceGroups, normalizeGameinfoMarket, normalizeMarketPage } from "@/lib/gameinfo-market-system";

const providers = {
  kaleoz: {
    listGames: loadKaleozGames,
    fetchPage: (game, productType, options) => fetchKaleozPage(game, productType, options),
  },
  itemku: {
    listGames: loadItemkuGames,
    fetchPage: (game, productType, options) => fetchItemkuPage(game, productType, options),
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

export async function fetchNormalizedGameinfoMarketCatalog(market, externalGameKey, productType = "", ownSellerNames = []) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const page = await providers[normalizedMarket].fetchPage(externalGameKey, productType || undefined, { force: true });
  return normalizeMarketPage(normalizedMarket, buildGameinfoOwnSellerReferenceGroups(normalizedMarket, page, ownSellerNames));
}
