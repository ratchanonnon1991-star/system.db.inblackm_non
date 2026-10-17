import { fetchGameinfoRate } from "@/server/gameinfo-exchange-rates";
import { SALE_FX_CURRENCIES, applySaleQuote, retainSaleQuote } from "@/lib/usdcodashop-sale-conversion";

export function createCodaSaleRateLoader({ fetchRate = fetchGameinfoRate, fetchImpl = fetch, now = () => new Date() } = {}) {
  const cache = new Map();
  return async (currency) => {
    if (!SALE_FX_CURRENCIES.includes(currency)) return null;
    const time = now(); const previous = cache.get(currency);
    if (previous && previous.expires > time.getTime()) return previous.promise;
    const entry = { expires: time.getTime() + 60 * 60_000 };
    entry.promise = (async () => {
      let data;
      if (currency === "RUB") {
        const response = await fetchImpl("https://api.frankfurter.dev/v2/rate/RUB/THB", { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("RUB rate unavailable");
        const body = await response.json();
        data = { rate: body.rate, provider: "Frankfurter", providerTime: body.date ? `${body.date}T00:00:00.000Z` : null };
      } else {
        data = await fetchRate(currency === "USDT" ? "USDT/THB" : "IDRTHB", { fetchImpl });
      }
      if (!(Number(data.rate) > 0) || !Number.isFinite(Number(data.rate))) throw new Error("Invalid rate");
      const providerAt = Date.parse(data.providerTime);
      const maxAge = currency === "USDT" ? 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
      if (!Number.isFinite(providerAt) || providerAt > time.getTime() + 5 * 60_000 || time.getTime() - providerAt > maxAge) throw new Error("Stale rate");
      return { currency, rate: String(data.rate), source: data.provider, rateAt: data.providerTime || null, fetchedAt: time.toISOString() };
    })().catch(() => {
      // No USD=USDT assumption, hard-coded rate, raw upstream error, or silent zero.
      entry.expires = time.getTime() + 60_000;
      return null;
    });
    cache.set(currency, entry);
    return entry.promise;
  };
}
const loadRate = createCodaSaleRateLoader();

export async function prepareCodaSales(orders, previousRows, { rateLoader = loadRate, now = () => new Date() } = {}) {
  const previous = new Map(previousRows.map((row) => [String(row.source_id), row.details]));
  const flights = new Map();
  return Promise.all(orders.map(async (order) => {
    const details = order.details; const old = previous.get(order.sourceId);
    if (!SALE_FX_CURRENCIES.includes(details.saleCurrency)) return order;
    if (old?.saleConversion?.currency === details.saleCurrency) return { ...order, details: retainSaleQuote(details, old) };
    if (details.saleThb != null) return order; // A verified native THB amount is never converted twice.
    if (!flights.has(details.saleCurrency)) flights.set(details.saleCurrency, Promise.resolve().then(() => rateLoader(details.saleCurrency)).catch(() => null));
    const quote = await flights.get(details.saleCurrency);
    return { ...order, details: applySaleQuote(details, quote ? { ...quote, capturedAt: now().toISOString() } : null) };
  }));
}
