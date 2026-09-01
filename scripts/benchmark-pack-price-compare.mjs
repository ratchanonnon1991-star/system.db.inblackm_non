// Usage: node scripts/benchmark-pack-price-compare.mjs <url> [cookie]
// Example URL: http://localhost:4183/api/gameinfo/pack-price-compare?gameId=1&market=kaleoz&mode=uid&page=1
const [url, cookie = ""] = process.argv.slice(2);
if (!url) throw new Error("ระบุ URL ของ pack-price-compare API");

const started = performance.now();
const response = await fetch(url, { headers: cookie ? { cookie } : {} });
const body = await response.text();
const elapsedMs = performance.now() - started;
if (!response.ok) throw new Error(`${response.status}: ${body}`);
const parsed = JSON.parse(body);
const comparison = parsed.comparison || {};
const rows = comparison.rows?.length || 0;
const sellers = comparison.sellers?.length || 0;

console.table({
  status: response.status,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  serverTiming: response.headers.get("server-timing") || "not-instrumented",
  queryCount: response.headers.get("x-query-count") || "not-instrumented",
  payloadBytes: Buffer.byteLength(body),
  rows,
  renderedCells: rows * (2 + sellers),
});
