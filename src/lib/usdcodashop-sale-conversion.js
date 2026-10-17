import { signedUsd } from "./usdcodashop-ledger.js";

export const SALE_FX_CURRENCIES = ["IDR", "USDT", "RUB"];
function decimal(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,12}(?:\.\d{1,20})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return { units: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) };
}
export function convertSaleThb(amount, rate) {
  const a = decimal(amount); const r = decimal(rate);
  if (!a || !r || r.units <= 0n) return null;
  const denominator = a.scale * r.scale;
  const cents = (a.units * r.units * 100n + denominator / 2n) / denominator;
  return cents > 99999999999999n ? null : signedUsd(cents);
}
export function applySaleQuote(details, quote) {
  if (!SALE_FX_CURRENCIES.includes(details.saleCurrency) || !quote || quote.currency !== details.saleCurrency) return details;
  const sale = convertSaleThb(details.saleNative, quote.rate);
  if (sale === null) return details;
  return { ...details, saleThb: sale, saleConversion: {
    currency: quote.currency, rate: String(quote.rate), source: String(quote.source || "").slice(0, 80),
    rateAt: quote.rateAt || null, fetchedAt: quote.fetchedAt || null,
    capturedAt: quote.capturedAt || null, kind: "first-sync-reference",
  } };
}
export function retainSaleQuote(details, previous = {}) {
  // Serialize under the wallet lock: concurrent manual/worker sync must keep the first committed quote.
  if (previous.saleConversion && previous.saleConversion.currency === details.saleCurrency && convertSaleThb("0", previous.saleConversion.rate) !== null) {
    const result = applySaleQuote(details, previous.saleConversion);
    return result === details ? { ...details, saleThb: null, saleConversion: previous.saleConversion } : result;
  }
  return details;
}
export function stableMetadata(value) {
  if (Array.isArray(value)) return value.map(stableMetadata);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableMetadata(value[key])]));
  return value;
}
