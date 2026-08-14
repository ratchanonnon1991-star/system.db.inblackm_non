const RATE_TTL_MS = 60 * 60 * 1000;
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=thb&include_last_updated_at=true";

let cache = {
  checkedAt: 0,
  value: null,
  sourceUpdatedAt: null,
  stale: false,
};
let pendingRequest = null;

export function parseUsdtThbPayload(payload) {
  const value = Number(payload?.tether?.thb);
  if (!Number.isFinite(value) || value <= 0) return null;
  const sourceTimestamp = Number(payload?.tether?.last_updated_at);
  return {
    value,
    sourceUpdatedAt:
      Number.isFinite(sourceTimestamp) && sourceTimestamp > 0
        ? new Date(sourceTimestamp * 1000).toISOString()
        : null,
  };
}

/**
 * One shared hourly cache for every game and pack. The market value is
 * runtime reference data, so it never gets written into gamelist_packs.
 * Failed refreshes keep the last valid value and are not retried until the
 * next hourly window, preventing a broken upstream from causing a request
 * storm.
 */
export async function getUsdtThbRate() {
  const now = Date.now();
  if (now - cache.checkedAt < RATE_TTL_MS) {
    return { ...cache };
  }
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    cache.checkedAt = now;
    try {
      const headers = { accept: "application/json" };
      if (process.env.COINGECKO_DEMO_API_KEY) {
        headers["x-cg-demo-api-key"] = process.env.COINGECKO_DEMO_API_KEY;
      }
      const response = await fetch(COINGECKO_URL, {
        headers,
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
      const parsed = parseUsdtThbPayload(await response.json());
      if (!parsed) throw new Error("CoinGecko returned an invalid USDT/THB rate");
      cache = { checkedAt: now, ...parsed, stale: false };
    } catch (error) {
      cache = { ...cache, checkedAt: now, stale: cache.value !== null };
      console.error("Unable to refresh USDT/THB rate:", error);
    } finally {
      pendingRequest = null;
    }
    return { ...cache };
  })();

  return pendingRequest;
}
