import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextGameinfoMarketRunAt } from "@/lib/gameinfo-market-system.js";
import { resolveGameinfoPricePage } from "@/server/gameinfo-price-page-store.js";

function fakeStore() {
  const rows = new Map();
  return {
    rows,
    saves: 0,
    async read(market, game, productType) {
      return rows.get(`${market}:${game}:${productType}`) || null;
    },
    async save(market, game, productType, page) {
      this.saves += 1;
      rows.set(`${market}:${game}:${productType}`, JSON.parse(JSON.stringify(page)));
    },
  };
}

const GAMES = [{ value: "zepeto-top-up", slug: "zepeto-top-up", label: "ZEPETO" }];

function loadedPage(price) {
  return {
    provider: "g2g",
    fetchedAt: "2026-08-31T00:00:00.000Z",
    nextRefreshAt: "2026-08-31T01:00:00.000Z",
    games: GAMES,
    groups: [{ key: "pack-1", offers: [{ seller: "shop", price }] }],
  };
}

function resolve(store, cache, { force = false, load, ...rest } = {}) {
  return resolveGameinfoPricePage({
    market: "g2g",
    game: "zepeto-top-up",
    productType: "all",
    games: GAMES,
    cache,
    cacheKey: "zepeto-top-up:all",
    ttlMs: 60 * 60 * 1000,
    force,
    store,
    load,
    ...rest,
  });
}

// The first load has nothing stored, so it fetches and writes the snapshot.
const store = fakeStore();
let loads = 0;
const first = await resolve(store, new Map(), { load: async () => { loads += 1; return loadedPage(10); } });
assert.equal(loads, 1);
assert.equal(store.saves, 1);
assert.deepEqual(first.games, GAMES);
assert.equal(first.groups[0].offers[0].price, 10);

// The stored page is what the compare page renders, and it must not freeze the
// saved game list into the snapshot.
const stored = store.rows.get("g2g:zepeto-top-up:all");
assert.equal(stored.games, undefined);
assert.equal(stored.provider, "g2g");

// A cold worker (empty memory cache) answers from the database without fetching.
const second = await resolve(store, new Map(), { load: async () => { loads += 1; return loadedPage(11); } });
assert.equal(loads, 1);
assert.deepEqual(second.games, GAMES);
assert.equal(second.groups[0].offers[0].price, 10);

// The refresh button keeps its old rule: force always goes to the market.
const forced = await resolve(store, new Map(), { force: true, load: async () => { loads += 1; return loadedPage(12); } });
assert.equal(loads, 2);
assert.equal(forced.groups[0].offers[0].price, 12);
assert.equal(store.rows.get("g2g:zepeto-top-up:all").groups[0].offers[0].price, 12);

// The snapshot stands until the daily 09:00 job replaces it.
assert.equal(forced.nextRefreshAt, nextGameinfoMarketRunAt().toISOString());

// A hot memory copy is served without touching the store at all.
const hot = new Map();
await resolve(store, hot, { load: async () => { loads += 1; return loadedPage(13); } });
const readsBefore = store.saves;
await resolve(store, hot, { load: async () => { loads += 1; return loadedPage(14); } });
assert.equal(store.saves, readsBefore);

// A refresh that brings the same prices back keeps the previous page object, so
// `fetchedAt` still reads as "when the prices last changed".
const settled = await resolve(store, new Map(), { force: true, load: async () => ({ ...loadedPage(12), fetchedAt: "2026-09-01T00:00:00.000Z" }) });
assert.equal(settled.unchanged, true);
assert.equal(settled.fetchedAt, "2026-08-31T00:00:00.000Z");
assert.equal(settled.checkedAt, "2026-09-01T00:00:00.000Z");

// A failed fetch on top of a snapshot rethrows for Kaleoz/G2G and keeps serving
// the snapshot for itemku — the same split as before the store existed.
await assert.rejects(
  resolve(store, new Map(), { force: true, load: async () => { throw new Error("G2G ตอบกลับ 503"); } }),
  /G2G ตอบกลับ 503/
);
const fallback = await resolve(store, new Map(), {
  force: true,
  serveStoredOnError: true,
  load: async () => { throw new Error("itemku ตอบกลับ 503"); },
});
assert.equal(fallback.groups[0].offers[0].price, 12);
assert.deepEqual(fallback.games, GAMES);

// With nothing stored, a failure still surfaces and leaves no cache entry behind.
const emptyStore = fakeStore();
const emptyCache = new Map();
await assert.rejects(
  resolve(emptyStore, emptyCache, { load: async () => { throw new Error("โหลดไม่สำเร็จ"); } }),
  /โหลดไม่สำเร็จ/
);
assert.equal(emptyCache.size, 0);
assert.equal(emptyStore.saves, 0);

const storeSource = readFileSync(new URL("../src/server/gameinfo-price-page-store.js", import.meta.url), "utf8");
assert.match(storeSource, /CREATE TABLE IF NOT EXISTS gameinfo_price_pages[\s\S]*PRIMARY KEY \(market, game, product_type\)/);
const ddl = readFileSync(new URL("../db-init/005-gameinfo-market-system.sql", import.meta.url), "utf8");
assert.match(ddl, /CREATE TABLE IF NOT EXISTS gameinfo_price_pages[\s\S]*PRIMARY KEY \(market, game, product_type\)/);

for (const [file, market] of [["g2g-prices", "g2g"], ["kaleoz-zepeto", "kaleoz"], ["itemku-prices", "itemku"]]) {
  const source = readFileSync(new URL(`../src/server/${file}.js`, import.meta.url), "utf8");
  assert.match(source, new RegExp(`resolveGameinfoPricePage\\(\\{[\\s\\S]*market: "${market}"`));
}

const providers = readFileSync(new URL("../src/server/gameinfo-market-providers.js", import.meta.url), "utf8");
assert.match(providers, /export async function refreshGameinfoPricePages[\s\S]*listGameinfoPricePageKeys\(\)[\s\S]*force: true/);
const scheduler = readFileSync(new URL("../src/server/gameinfo-market-scheduler.js", import.meta.url), "utf8");
assert.match(scheduler, /nextGameinfoMarketRunAt[\s\S]*refreshGameinfoPricePages\(\)/);
for (const route of ["g2g-games", "kaleoz-games", "itemku-games"]) {
  const source = readFileSync(new URL(`../src/app/api/gameinfo/${route}/route.js`, import.meta.url), "utf8");
  assert.match(source, /export async function DELETE[\s\S]*deleteGameinfoPricePages\(/);
}

console.log("33 passed");
