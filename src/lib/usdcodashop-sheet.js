import { signedUsd } from "./usdcodashop-ledger.js";

// Decimal-only, half-up to cents. Never evaluate spreadsheet formulas from a DB payload.
export function sheetCents(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!/^\d{1,12}(?:\.\d{1,20})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0")) + (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
}
export function orderLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function sheetFigures(details = {}) {
  const sale = sheetCents(details.saleThb); const cost = sheetCents(details.costThb);
  const profit = sale !== null && cost !== null ? sale - cost : null;
  let margin = null;
  if (profit !== null && sale > 0n) {
    const negative = profit < 0n; const numerator = (negative ? -profit : profit) * 10000n;
    const rounded = (numerator + sale / 2n) / sale;
    margin = signedUsd(negative ? -rounded : rounded);
  }
  return { sale: sale === null ? null : signedUsd(sale), cost: cost === null ? null : signedUsd(cost),
    profit: profit === null ? null : signedUsd(profit), margin };
}
export function listingFields(row, listing = {}) {
  const source = String(row.source || row.telegram_source || "").toLowerCase();
  const currency = ({ kaleoz: "THB", page: "THB", russia_reseller: "USDT", russia: "USDT", itemku: "IDR", playerok: "RUB", "playerok-topupman": "RUB", playerok_topupman: "RUB" })[source] || null;
  // Known THB channels only. Itemku/Russia require a verified conversion rate, not today's guessed rate.
  const raw = row.sale_price;
  const listingSale = listing.listing_source === "kaleoz" ? listing.sale_amount : null;
  const sale = sheetCents(listingSale ?? (currency === "THB" ? raw : null));
  return {
    saleThb: sale === null ? null : signedUsd(sale), saleNative: sheetCents(raw) === null ? null : String(raw), saleCurrency: currency,
    customer: String(listing.buyer || "").slice(0, 200), link: orderLink(listing.link),
    category: row.method === "uid" || row.method === "UID" ? "UID" : row.method === "idpass" ? "ID/Pass" : "",
    playerId: String(listing.player_id || row.player_id || "").slice(0, 200),
    sheetOperator: String(listing.filler || "").slice(0, 160),
  };
}
