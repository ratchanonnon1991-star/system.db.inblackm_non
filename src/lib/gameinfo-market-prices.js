import { evaluateGameinfoComputedColumn } from "@/lib/gameinfo-computed-evaluator";

export function findGameinfoMarketPriceColumn(computedColumns, market) {
  return (computedColumns || []).find((column) => (
    column.kind === "market" && column.marketKey === market && column.enabled !== false
  )) || null;
}

export function buildGameinfoMarketPackPriceMap(
  { currencies = [], computedColumns = [], costProfiles = [] } = {},
  game,
  market,
  { formulaVariables = [], externalValues = {} } = {}
) {
  const marketColumn = findGameinfoMarketPriceColumn(computedColumns, market);
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
