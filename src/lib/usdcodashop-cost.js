import { convertSaleThb } from "@/lib/usdcodashop-sale-conversion";
import { sheetFigures } from "@/lib/usdcodashop-sheet";

export function codaCostQuote(value) {
  if (!value || value.currency !== "USD" || convertSaleThb("1", value.rate) == null) return null;
  return { currency: "USD", rate: String(value.rate).trim(), source: String(value.source || "").slice(0, 80),
    rateAt: value.rateAt || null, fetchedAt: value.fetchedAt || null, kind: "current-reference" };
}

// Display-only revaluation. Never overwrite the persisted cost_thb, USD debit or wallet balance.
export function codaCurrentCostFigures(row, value) {
  const quote = codaCostQuote(value);
  const cost = row.kind === "order" && quote ? convertSaleThb(row.amount, quote.rate) : null;
  return sheetFigures({ ...(row.details || {}), costThb: cost });
}
