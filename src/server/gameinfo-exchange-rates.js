import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const CACHE_MS = 60 * 60 * 1000;
const HISTORY_LIMIT = 48;
const PAIRS = {
  "USDT/THB": { provider: "CoinGecko", kind: "crypto" },
  USDCNY: { provider: "Frankfurter/ECB", kind: "fiat" },
};

const schemaReady = new Map();
const refreshFlights = new Map();

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizeGameinfoRatePair(value) {
  const compact = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (compact === "USDTTHB") return "USDT/THB";
  if (compact === "USDCNY") return "USDCNY";
  return null;
}

export function validateGameinfoRateValue(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("ผู้ให้บริการส่งอัตราแลกเปลี่ยนไม่ถูกต้อง");
  return rate;
}

export async function fetchGameinfoRate(pair, { fetchImpl = fetch } = {}) {
  const normalized = normalizeGameinfoRatePair(pair);
  if (!normalized) throw createHttpError("ไม่รองรับคู่สกุลเงินนี้", 400);
  const signal = AbortSignal.timeout(8000);
  if (normalized === "USDT/THB") {
    const headers = {};
    if (process.env.COINGECKO_DEMO_API_KEY) {
      headers["x-cg-demo-api-key"] = process.env.COINGECKO_DEMO_API_KEY;
    }
    const response = await fetchImpl(
      "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=thb&include_last_updated_at=true",
      { headers, signal }
    );
    if (!response.ok) throw new Error(`CoinGecko ตอบกลับ ${response.status}`);
    const body = await response.json();
    return {
      pair: normalized,
      rate: validateGameinfoRateValue(body?.tether?.thb),
      provider: PAIRS[normalized].provider,
      providerTime: body?.tether?.last_updated_at
        ? new Date(body.tether.last_updated_at * 1000).toISOString()
        : null,
    };
  }

  const response = await fetchImpl(
    "https://api.frankfurter.dev/v2/rate/USD/CNY?providers=ECB",
    { signal }
  );
  if (!response.ok) throw new Error(`Frankfurter ตอบกลับ ${response.status}`);
  const body = await response.json();
  return {
    pair: normalized,
    rate: validateGameinfoRateValue(body?.rate),
    provider: PAIRS[normalized].provider,
    providerTime: body?.date ? `${body.date}T00:00:00.000Z` : null,
  };
}

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find((connection) => connection.name.trim().toLowerCase() === CONNECTION_NAME);
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

async function getReadyPool() {
  const connection = await getGameinfoConnection();
  if (!connection) throw createHttpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  if (!schemaReady.has(cacheKey)) {
    const pool = getPoolForConnection(connection);
    const promise = pool.query(`
      CREATE TABLE IF NOT EXISTS gameinfo_exchange_rates (
        pair         VARCHAR(16) NOT NULL,
        fetched_hour TIMESTAMPTZ NOT NULL,
        rate         NUMERIC NOT NULL CHECK (rate > 0),
        provider     VARCHAR(80) NOT NULL,
        fetched_at   TIMESTAMPTZ NOT NULL,
        provider_at  TIMESTAMPTZ,
        expires_at   TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (pair, fetched_hour)
      )
    `).catch((error) => {
      schemaReady.delete(cacheKey);
      throw error;
    });
    schemaReady.set(cacheKey, promise);
  }
  await schemaReady.get(cacheKey);
  return getPoolForConnection(connection);
}

function mapRateRow(row, now, error = "") {
  if (!row) return { rate: null, source: "", fetchedAt: null, stale: true, available: false, error };
  const expiresAt = new Date(row.expires_at).getTime();
  return {
    rate: Number(row.rate),
    source: row.provider,
    fetchedAt: new Date(row.fetched_at).toISOString(),
    providerAt: row.provider_at ? new Date(row.provider_at).toISOString() : null,
    stale: !Number.isFinite(expiresAt) || expiresAt <= now.getTime(),
    available: true,
    error,
  };
}

async function readLatest(client, pair) {
  const result = await client.query(
    `SELECT pair, rate, provider, fetched_at, provider_at, expires_at
       FROM gameinfo_exchange_rates WHERE pair = $1
      ORDER BY fetched_hour DESC LIMIT 1`,
    [pair]
  );
  return result.rows[0] || null;
}

async function refreshPair(pool, pair, now, fetchImpl) {
  if (refreshFlights.has(pair)) return refreshFlights.get(pair);
  const flight = (async () => {
    const fetched = await fetchGameinfoRate(pair, { fetchImpl });
    const expiresAt = new Date(now.getTime() + CACHE_MS);
    await pool.query(
      `INSERT INTO gameinfo_exchange_rates
         (pair, fetched_hour, rate, provider, fetched_at, provider_at, expires_at)
       VALUES ($1, date_trunc('hour', $2::timestamptz), $3, $4, $2, $5, $6)
       ON CONFLICT (pair, fetched_hour) DO UPDATE SET
         rate = EXCLUDED.rate,
         provider = EXCLUDED.provider,
         fetched_at = EXCLUDED.fetched_at,
         provider_at = EXCLUDED.provider_at,
         expires_at = EXCLUDED.expires_at`,
      [pair, now.toISOString(), fetched.rate, fetched.provider, fetched.providerTime, expiresAt.toISOString()]
    );
    return {
      pair,
      rate: fetched.rate,
      source: fetched.provider,
      fetchedAt: now.toISOString(),
      providerAt: fetched.providerTime,
      stale: false,
      available: true,
      error: "",
    };
  })().finally(() => refreshFlights.delete(pair));
  refreshFlights.set(pair, flight);
  return flight;
}

async function loadHistory(client, pair) {
  const result = await client.query(
    `SELECT rate, fetched_at FROM gameinfo_exchange_rates
      WHERE pair = $1 ORDER BY fetched_hour DESC LIMIT $2`,
    [pair, HISTORY_LIMIT]
  );
  return result.rows
    .map((row) => ({ rate: Number(row.rate), fetchedAt: new Date(row.fetched_at).toISOString() }))
    .reverse();
}

export async function getGameinfoExchangeRates(
  requestedPairs,
  { now = new Date(), fetchImpl = fetch } = {}
) {
  const pairs = [...new Set((requestedPairs || []).map(normalizeGameinfoRatePair).filter(Boolean))];
  if (pairs.length === 0) throw createHttpError("กรุณาระบุคู่สกุลเงินที่รองรับ", 400);
  const pool = await getReadyPool();

  return Promise.all(
    pairs.map(async (pair) => {
      const client = await pool.connect();
      let latest;
      try {
        latest = await readLatest(client, pair);
      } finally {
        client.release();
      }
      let current = mapRateRow(latest, now);
      if (current.stale) {
        try {
          current = await refreshPair(pool, pair, now, fetchImpl);
        } catch (error) {
          current = mapRateRow(latest, now, error instanceof Error ? error.message : "ดึงราคาไม่สำเร็จ");
        }
      }
      const historyClient = await pool.connect();
      try {
        return { pair, ...current, history: await loadHistory(historyClient, pair) };
      } finally {
        historyClient.release();
      }
    })
  );
}
