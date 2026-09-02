import {
  fetchGameinfoRate,
  normalizeGameinfoRatePair,
  validateGameinfoRateValue,
} from "@/server/gameinfo-exchange-rates.js";
import {
  GAMEINFO_RATE_CACHE_MS,
  nextCoinGeckoRefreshAt,
  nextFrankfurterRefreshAt,
} from "@/lib/gameinfo-rate-schedule.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
async function rejects(name, fn) {
  try {
    await fn();
    failures.push(`${name}\n    expected rejection`);
  } catch {
    pass += 1;
  }
}

check("normalizes compact USDT pair", normalizeGameinfoRatePair("usdthb"), null);
check("normalizes USDT/THB", normalizeGameinfoRatePair("usdtthb"), "USDT/THB");
check("normalizes USD/CNY pair token", normalizeGameinfoRatePair("USD/CNY"), "USDCNY");
check("normalizes IDR/THB pair token", normalizeGameinfoRatePair("IDR/THB"), "IDRTHB");
check("normalizes USD/IDR pair token", normalizeGameinfoRatePair("USD/IDR"), "USDIDR");
check("rejects unsupported pair", normalizeGameinfoRatePair("USD/THB"), null);
check("accepts positive finite rate", validateGameinfoRateValue("34.25"), 34.25);
await rejects("rejects zero rate", () => Promise.resolve(validateGameinfoRateValue(0)));
check("CoinGecko cache lasts one hour", GAMEINFO_RATE_CACHE_MS["USDT/THB"], 60 * 60 * 1000);
check("Frankfurter cache lasts twelve hours", GAMEINFO_RATE_CACHE_MS.USDCNY, 12 * 60 * 60 * 1000);
check("IDR pairs use the Frankfurter cache", [GAMEINFO_RATE_CACHE_MS.IDRTHB, GAMEINFO_RATE_CACHE_MS.USDIDR], [12 * 60 * 60 * 1000, 12 * 60 * 60 * 1000]);
check(
  "CoinGecko schedules the next top of hour",
  nextCoinGeckoRefreshAt(new Date("2026-08-28T03:42:18.000Z")).toISOString(),
  "2026-08-28T04:00:00.000Z"
);
check(
  "Frankfurter schedules 11:05 Thailand time",
  nextFrankfurterRefreshAt(new Date("2026-08-28T03:42:18.000Z")).toISOString(),
  "2026-08-28T04:05:00.000Z"
);
check(
  "Frankfurter schedules 23:05 Thailand time",
  nextFrankfurterRefreshAt(new Date("2026-08-28T08:00:00.000Z")).toISOString(),
  "2026-08-28T16:05:00.000Z"
);

const cryptoCalls = [];
const crypto = await fetchGameinfoRate("USDT/THB", {
  fetchImpl: async (url) => {
    cryptoCalls.push(url);
    return { ok: true, json: async () => ({ tether: { thb: 33.7, last_updated_at: 1_700_000_000 } }) };
  },
});
check("CoinGecko response maps to USDT rate", crypto.rate, 33.7);
check("USDT fetch uses tether simple-price endpoint", cryptoCalls[0].includes("ids=tether"), true);

const fiat = await fetchGameinfoRate("USDCNY", {
  fetchImpl: async (url) => ({
    ok: url.includes("/rate/USD/CNY?providers=ECB"),
    json: async () => ({ date: "2026-08-17", base: "USD", quote: "CNY", rate: 7.18 }),
  }),
});
check("Frankfurter response maps to USD/CNY rate", fiat, {
  pair: "USDCNY",
  rate: 7.18,
  provider: "Frankfurter/ECB",
  providerTime: "2026-08-17T00:00:00.000Z",
});
const idrCalls = [];
const idrThb = await fetchGameinfoRate("IDRTHB", {
  fetchImpl: async (url) => {
    idrCalls.push(url);
    return { ok: true, json: async () => ({ date: "2026-08-17", rate: 0.0019 }) };
  },
});
check("IDRTHB uses the Frankfurter IDR/THB endpoint", idrCalls[0].includes("/rate/IDR/THB?providers=ECB"), true);
check("IDRTHB response maps to the formula rate", idrThb.rate, 0.0019);
const usdIdrCalls = [];
await fetchGameinfoRate("USDIDR", {
  fetchImpl: async (url) => {
    usdIdrCalls.push(url);
    return { ok: true, json: async () => ({ date: "2026-08-17", rate: 16350 }) };
  },
});
check("USDIDR uses the Frankfurter USD/IDR endpoint", usdIdrCalls[0].includes("/rate/USD/IDR?providers=ECB"), true);
await rejects("fetch rejects unsupported provider pair", () => fetchGameinfoRate("EUR/THB", { fetchImpl: async () => ({}) }));

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
