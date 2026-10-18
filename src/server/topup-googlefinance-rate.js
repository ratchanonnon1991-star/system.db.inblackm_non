import { createGoogleReader } from "@/server/google-sheets";

// Rate-only spreadsheet created for this integration. No customer/order data is read.
export const TOPUP_FX_SPREADSHEET_ID = "1cyf6BPQa7pLgUzdIX38q85BfXC3jRql94Q5u4p3Lx6M";
export const TOPUP_FX_RANGE = "'Rates'!B2";
export function createTopupGoogleRateLoader({ env = process.env, readerFactory = createGoogleReader, now = () => Date.now() } = {}) {
  let reader, cached;
  return async () => {
    const time = now();
    if (cached && cached.expires > time) return cached.promise;
    const entry = { expires: time + 5 * 60_000 };
    entry.promise = (async () => {
      if (!env.TOPUP_FX_SHEETS_CREDENTIALS) throw new Error("Topup FX credentials missing");
      reader ||= readerFactory({ keyFile: env.TOPUP_FX_SHEETS_CREDENTIALS, readOnly: true });
      const rate = await reader.cell(TOPUP_FX_SPREADSHEET_ID, TOPUP_FX_RANGE);
      // Formula errors, blanks or textual rates must not become zero or a fallback provider.
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 1000) throw new Error("Invalid GoogleFinance USDTHB rate");
      return { currency: "USD", rate: String(rate), source: "GoogleFinance/Google Sheets", rateAt: null,
        fetchedAt: new Date(now()).toISOString() };
    })().catch(() => { entry.expires = now() + 30_000; return null; });
    cached = entry; return entry.promise;
  };
}
export const loadTopupGoogleRate = createTopupGoogleRateLoader();
