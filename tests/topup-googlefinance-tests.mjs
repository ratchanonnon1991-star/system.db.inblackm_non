import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createGoogleReader } from "../src/server/google-sheets.js";
import { createTopupGoogleRateLoader, TOPUP_FX_SPREADSHEET_ID, TOPUP_FX_RANGE } from "../src/server/topup-googlefinance-rate.js";
import { createMgcSalePreparer } from "../src/server/multigamecard-sale-rates.js";
import { mgcOrder, mgcSummary, mgcCsv } from "../src/lib/multigamecard-inventory.js";

let clock = Date.parse("2026-10-18T08:00:00Z"), reads = 0, value = 33.4449838;
const options = [];
const loader = createTopupGoogleRateLoader({ env: { TOPUP_FX_SHEETS_CREDENTIALS: "/test/fx.json", ITUNE_SHEETS_CREDENTIALS: "/never-itune.json" }, now: () => clock,
  readerFactory: o => { options.push(o); return { cell: async (id, range) => { reads++; assert.equal(id, TOPUP_FX_SPREADSHEET_ID); assert.equal(range, TOPUP_FX_RANGE); return value; } }; } });
const [a, b] = await Promise.all([loader(), loader()]);
assert.equal(reads, 1); assert.equal(a, b); assert.equal(a.currency, "USD"); assert.equal(a.rate, "33.4449838");
assert.deepEqual(options, [{ keyFile: "/test/fx.json", readOnly: true }]);
clock += 300001; value = 34;
assert.equal((await loader()).rate, "34"); assert.equal(reads, 2);
clock += 300001; value = "#N/A";
assert.equal(await loader(), null); assert.equal(await loader(), null); assert.equal(reads, 3);
clock += 30001; value = 35;
assert.equal((await loader()).rate, "35");
for (const bad of [null, "", "33.4", 0, -1, Infinity, NaN, 1001]) {
  const load = createTopupGoogleRateLoader({ env: { TOPUP_FX_SHEETS_CREDENTIALS: "key" }, readerFactory: () => ({ cell: async () => bad }) });
  assert.equal(await load(), null);
}
assert.equal(await createTopupGoogleRateLoader({ env: { ITUNE_SHEETS_CREDENTIALS: "must-not-use" }, readerFactory: () => { throw Error("must not call"); } })(), null);
assert.equal(await createTopupGoogleRateLoader({ env: { TOPUP_FX_SHEETS_CREDENTIALS: "key" }, readerFactory: () => ({ cell: async () => { throw Error("private failure"); } }) })(), null);

// Real JWT + HTTP request shape, but no files or external requests.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
let tokens = 0, gets = 0;
const reader = createGoogleReader({ keyFile: "/test/new-key.json", readOnly: true,
  readKeyFile: async path => { assert.equal(path, "/test/new-key.json"); return JSON.stringify({ client_email: "fixture@example.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }); },
  fetchImpl: async (url, init) => {
    if (url === "https://oauth2.googleapis.com/token") {
      tokens++; const jwt = init.body.get("assertion");
      assert.equal(JSON.parse(Buffer.from(jwt.split(".")[1], "base64url")).scope, "https://www.googleapis.com/auth/spreadsheets.readonly");
      return { ok: true, json: async () => ({ access_token: "fixture-token", expires_in: 3600 }) };
    }
    gets++; assert.equal(init.headers.Authorization, "Bearer fixture-token");
    assert.ok(url.endsWith("/values/" + encodeURIComponent(TOPUP_FX_RANGE) + "?valueRenderOption=UNFORMATTED_VALUE"));
    return { ok: true, json: async () => ({ values: [[33.4449838]] }) };
  } });
assert.equal(await reader.cell(TOPUP_FX_SPREADSHEET_ID, TOPUP_FX_RANGE), 33.4449838);
await reader.cell(TOPUP_FX_SPREADSHEET_ID, TOPUP_FX_RANGE);
assert.equal(tokens, 1); assert.equal(gets, 2);
await assert.rejects(reader.writeRaw("sheet", [{ range: "B2", value: 1 }]), /read-only/);

let quotes = 0;
const quote = { currency: "USD", rate: "33.4449838", source: "GoogleFinance/Google Sheets", fetchedAt: new Date(clock).toISOString(), rateAt: null };
const input = (id, source, price, packs) => ({ sourceId: id, row: { id, source, sale_price: price, redeem_points: "4990" },
  details: { saleNative: price, saleCurrency: "USDT", saleThb: "999", salePacks: packs } });
const orders = [input("1", "russia", "2.03"), input("2", "russia_reseller", "10", 2), input("3", "PAGE", "30")];
const before = JSON.stringify(orders);
const prepare = createMgcSalePreparer({ loadRate: async () => { quotes++; return quote; }, prepareOthers: async items => items });
const prepared = await prepare(orders);
assert.equal(quotes, 1); assert.equal(JSON.stringify(orders), before, "no source mutation");
assert.equal(prepared[0].details.saleThb, "67.89"); assert.equal(prepared[0].details.saleCurrency, "USD");
assert.equal(prepared[1].details.saleThb, "167.23"); assert.equal(prepared[2], orders[2]);
const mapped = prepared.slice(0, 2).map(o => mgcOrder({ ...o.row, sheet_fields: o.details }));
assert.equal(mapped[0].figures.cost, "149.78"); assert.equal(mapped[0].figures.profit, "-81.89");
assert.equal(mgcSummary(mapped).sale, "235.12");
const csv = mgcCsv(mapped); assert.ok(csv.includes("GoogleFinance/Google Sheets")); assert.ok(csv.includes("33.4449838"));
const failed = await createMgcSalePreparer({ loadRate: async () => { throw Error("unavailable"); }, prepareOthers: async items => items })(orders);
assert.equal(failed[0].details.saleThb, null); assert.equal(failed[0].details.saleConversion, null);
assert.equal(failed[2], orders[2]);
assert.equal(mgcOrder({ ...failed[0].row, sheet_fields: failed[0].details }).figures.cost, "149.78");
const badAmount = await prepare([input("4", "russia", "bad")]); assert.equal(badAmount[0].details.saleThb, null);
console.log("passed: GoogleFinance dedicated credentials, read-only JWT, numeric cell, cache/recovery, no fallback, Russia USD conversion, splitting, unchanged costs and other channels, totals and CSV");
