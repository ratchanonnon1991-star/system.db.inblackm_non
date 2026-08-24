// USD -> THB spot rate from exchangerate-api.com
// (https://www.exchangerate-api.com/docs/overview), used to seed/refresh
// GoCash's cost rate (see ensureUsdThbRate in profit-aggregate.js). The free
// tier only updates once every 24h, so callers must cache this rather than
// calling on every request.
const API_BASE = "https://v6.exchangerate-api.com/v6";

export function validateExchangeRateValue(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("ผู้ให้บริการส่งอัตราแลกเปลี่ยนไม่ถูกต้อง");
  return rate;
}

export async function fetchUsdThbRate({ fetchImpl = fetch } = {}) {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) {
    const error = new Error("ยังไม่ได้ตั้งค่า EXCHANGERATE_API_KEY");
    error.status = 503;
    throw error;
  }
  const signal = AbortSignal.timeout(8000);
  const response = await fetchImpl(`${API_BASE}/${apiKey}/pair/USD/THB`, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.result !== "success") {
    throw new Error(body?.["error-type"] || `exchangerate-api ตอบกลับ ${response.status}`);
  }
  return {
    rate: validateExchangeRateValue(body.conversion_rate),
    providerTime: body.time_last_update_unix ? new Date(body.time_last_update_unix * 1000).toISOString() : null,
  };
}
