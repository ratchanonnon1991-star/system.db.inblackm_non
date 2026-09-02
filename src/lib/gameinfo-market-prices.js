import { evaluateGameinfoComputedColumn } from "@/lib/gameinfo-computed-evaluator";

// Which column holds this market's price for this game.
//
// Turning a market on used to append a market_<market> column that could never
// be deleted and existed only to be a market price. A game now points at a
// column it already has, which is what `priceColumnKey` is. Mappings made
// before that still have no key, so the old market-kind column is still looked
// up when none is named.
export function findGameinfoMarketPriceColumn(computedColumns, market, priceColumnKey = "") {
  const columns = computedColumns || [];
  if (priceColumnKey) {
    return columns.find((column) => column.key === priceColumnKey) || null;
  }
  return columns.find((column) => (
    column.kind === "market" && column.marketKey === market && column.enabled !== false
  )) || null;
}

export function buildGameinfoMarketPackPriceMap(
  { currencies = [], computedColumns = [], costProfiles = [] } = {},
  game,
  market,
  { formulaVariables = [], externalValues = {}, priceColumnKey = "" } = {}
) {
  const marketColumn = findGameinfoMarketPriceColumn(computedColumns, market, priceColumnKey);
  return new Map(currencies.flatMap((currency) => (currency.categories || []).flatMap((category) =>
    (category.packs || []).map((pack) => {
      let price = null;
      if (marketColumn) {
        try {
          const raw = evaluateGameinfoComputedColumn(
            marketColumn,
            computedColumns,
            pack,
            game,
            { categoryId: category.id, costProfiles, formulaVariables, externalValues }
          );
          const result = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
          price = Number.isFinite(result) ? result : null;
        } catch {
          price = null;
        }
      }
      // basePrice is the plain "ราคา" field in baht, kept next to the market
      // price so a market priced in another currency can be read against it.
      const basePrice = Number(pack.price);
      return [String(pack.id), { id: String(pack.id), name: pack.name, price, basePrice: Number.isFinite(basePrice) ? basePrice : null }];
    })
  )));
}
