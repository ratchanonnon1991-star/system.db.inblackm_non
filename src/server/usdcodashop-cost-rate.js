import { codaCostQuote } from "@/lib/usdcodashop-cost";

export function createCodaCostRateLoader({ fetchImpl = fetch, now = () => new Date() } = {}) {
  let cached;
  return async () => {
    const time = now();
    if (cached && cached.expires > time.getTime()) return cached.promise;
    const entry = { expires: time.getTime() + 15 * 60_000 };
    entry.promise = (async () => {
      // Daily USD reference, not USDT and not an invented Google Finance quote.
      const response = await fetchImpl("https://api.frankfurter.dev/v2/rate/USD/THB?providers=ECB", { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("USDTHB unavailable");
      const body = await response.json();
      const date = String(body.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid rate date");
      const at = new Date(`${date}T00:00:00.000Z`);
      if (!Number.isFinite(at.getTime()) || at.toISOString().slice(0, 10) !== date || at.getTime() > time.getTime() + 5 * 60_000 || time.getTime() - at.getTime() > 7 * 86400000) throw new Error("Stale rate");
      const quote = codaCostQuote({ currency: "USD", rate: body.rate, source: "Frankfurter/ECB", rateAt: at.toISOString(), fetchedAt: time.toISOString() });
      if (!quote) throw new Error("Invalid rate");
      return quote;
    })().catch(() => { entry.expires = time.getTime() + 60_000; return null; });
    cached = entry; return entry.promise;
  };
}

export const loadCodaCostRate = createCodaCostRateLoader();
