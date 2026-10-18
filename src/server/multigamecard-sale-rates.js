import { loadTopupGoogleRate } from "@/server/topup-googlefinance-rate";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { convertSaleThb } from "@/lib/usdcodashop-sale-conversion";
import { sheetCents, perPackCents } from "@/lib/usdcodashop-sheet";
import { signedUsd } from "@/lib/usdcodashop-ledger";

const isRussia = order => ["russia", "russia_reseller"].includes(String(order.row.source || order.row.telegram_source || "").toLowerCase());
export function createMgcSalePreparer({ loadRate = loadTopupGoogleRate, prepareOthers = prepareCodaSales } = {}) {
  return async (orders, previousRows = []) => {
    const others = await prepareOthers(orders.filter(order => !isRussia(order)), previousRows);
    const byId = new Map(others.map(order => [order.sourceId, order]));
    // Same quote for every Russia order in this response; no persistent historical FX lock.
    const quote = orders.some(isRussia) ? await loadRate().catch(() => null) : null;
    return orders.map(order => {
      if (!isRussia(order)) return byId.get(order.sourceId);
      const details = { ...order.details, saleCurrency: "USD", saleNative: order.row.sale_price ?? null,
        saleThb: null, saleConversion: null };
      const total = quote ? convertSaleThb(details.saleNative, quote.rate) : null;
      if (total !== null) {
        details.saleThb = signedUsd(perPackCents(sheetCents(total), details.salePacks));
        details.saleConversion = { ...quote, kind: "current-googlefinance-reference" };
      }
      return { ...order, details };
    });
  };
}
export const prepareMgcSales = createMgcSalePreparer();
