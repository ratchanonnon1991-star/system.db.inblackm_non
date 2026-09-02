import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../db-init/005-gameinfo-market-system.sql", import.meta.url), "utf8");
assert.match(schema, /CREATE TABLE IF NOT EXISTS gameinfo_market_rate_references[\s\S]*PRIMARY KEY \(market, external_game_key\)/);

const server = readFileSync(new URL("../src/server/gameinfo-market-system.js", import.meta.url), "utf8");
assert.match(server, /listGameinfoMarketRateReferenceOptions[\s\S]*listGameinfoMarketGames/);
assert.match(server, /saveGameinfoMarketRateReference[\s\S]*ON CONFLICT \(market, external_game_key\)/);
assert.match(server, /getGameinfoMarketRateReference\(market, externalGameKey\)[\s\S]*\{ at: referenceAt, includeHistory: false/);

const rates = readFileSync(new URL("../src/server/gameinfo-exchange-rates.js", import.meta.url), "utf8");
assert.match(rates, /readClosestTo[\s\S]*ABS\(EXTRACT\(EPOCH FROM \(fetched_at - \$2::timestamptz\)\)\)/);
assert.match(rates, /if \(!referenceAt && \(force \|\| \(refreshStale && current\.stale\)\)\)/);

const page = readFileSync(new URL("../src/components/gameinfo-market-rate-references-page.js", import.meta.url), "utf8");
assert.match(page, /TabsList variant="line"[\s\S]*type="datetime-local"/);
assert.match(page, /localDateTime\(\)[\s\S]*เพิ่มเวลาอ้างอิง/);

const api = readFileSync(new URL("../src/app/api/gameinfo/market-rate-references/route.js", import.meta.url), "utf8");
assert.match(api, /saveGameinfoMarketRateReference[\s\S]*deleteGameinfoMarketRateReference/);

const comparison = readFileSync(new URL("../src/components/gameinfo-market-compare-page.js", import.meta.url), "utf8");
assert.match(comparison, /rateReferenceAt[\s\S]*เรทอ้างอิง/);

console.log("10 passed");
