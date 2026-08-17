import {
  fetchGameinfoRate,
  normalizeGameinfoRatePair,
  validateGameinfoRateValue,
} from "@/server/gameinfo-exchange-rates.js";

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
check("rejects unsupported pair", normalizeGameinfoRatePair("USD/THB"), null);
check("accepts positive finite rate", validateGameinfoRateValue("34.25"), 34.25);
await rejects("rejects zero rate", () => Promise.resolve(validateGameinfoRateValue(0)));

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
await rejects("fetch rejects unsupported provider pair", () => fetchGameinfoRate("EUR/THB", { fetchImpl: async () => ({}) }));

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
