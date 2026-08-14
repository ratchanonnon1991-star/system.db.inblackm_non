import assert from "node:assert/strict";
import { parseUsdtThbPayload } from "@/server/gameinfo-usdt-rate.js";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields.js";

let passed = 0;
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  passed += 1;
}

check(
  "parses a valid CoinGecko Tether price",
  parseUsdtThbPayload({ tether: { thb: 32.54, last_updated_at: 1_700_000_000 } }),
  { value: 32.54, sourceUpdatedAt: new Date(1_700_000_000_000).toISOString() }
);
check("rejects a missing rate", parseUsdtThbPayload({ tether: {} }), null);
check("rejects a non-positive rate", parseUsdtThbPayload({ tether: { thb: 0 } }), null);
check("exposes USDT/THB to the formula editor", GAMEINFO_FIELD_NAMES.includes("USDT/THB"), true);
check(
  "resolves the live rate from the game context",
  resolveGameinfoField({}, { usdtThb: 32.54 }, "USDT/THB"),
  32.54
);

console.log(`${passed} passed`);
