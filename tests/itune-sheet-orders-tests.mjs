import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { columnIndex, sheetDate, dailyFileDate, itunesCurrency, sheetAmount, extractItunesRows, daysToRead, costThb } from "../src/lib/itune-sheet-orders.js";
import { readSheetOrders, importSheetOrder, thaiToday, assertEntryAccess } from "../src/server/itune-sheet-orders.js";
import { signServiceAccountJwt } from "../src/server/google-sheets.js";
let passed = 0; const check = (v, m) => { assert.ok(v, m); passed++; };

check(columnIndex("A") === 0 && columnIndex("Z") === 25 && columnIndex("AA") === 26);
check(sheetDate("18/10/2026") === "2026-10-18" && sheetDate("1/9/2026") === "2026-09-01" && sheetDate("31/2/2026") === null && sheetDate("x") === null);
check(dailyFileDate("0.1 Order Russia Reseller 18/10/2026 Bot2", "0.1 Order Russia Reseller ") === "2026-10-18");
check(dailyFileDate("0.1 Order Russia Reseller 18/10/2026", "0.1 Order Russia Reseller ") === null);
for (const [text, want] of [["itunes de", "DE"], ["DE", "DE"], ["iTunes USD", "USD"], [" usd ", "USD"], ["itune  usd", "USD"],
  ["ITUNES(USD)", "USD"], ["ITUNES (DE)", "DE"], ["itunes(de)", "DE"],
  ["CodashopUSD", null], ["CODASHOP (USD)", null], ["( USD ) BoT MultiGame Card", null], ["WavePay", null], ["", null]]) {
  check(itunesCurrency(text) === want, `channel ${text}`);
}
check(sheetAmount("12.5") === "12.50" && sheetAmount("$1,234.567") === "1234.57" && sheetAmount("0") === null && sheetAmount("abc") === null);
check(costThb("10.00", "35.25") === "352.50" && costThb("0.99", "34.123456") === "33.78" && costThb("1", null) === null);

// Columns per auto-balance: Marketplace order D, channel T, status U, email V, amount O.
const row = (cells) => { const r = []; for (const [col, v] of Object.entries(cells)) r[columnIndex(col)] = v; return r; };
const tab = [
  row({ D: "Order", T: "ช่องทาง", U: "สถานะ" }),
  row({ D: "M1", T: "itunes usd", U: "รอเติม", V: "Buyer@Mail.com", O: "9.99", R: "14:35", G: "350", I: "Somchai", J: "https://shop/x", K: "Genshin", L: "Welkin", N: "800123" }),
  row({ D: "M1", T: "itunes usd", U: "รอเติม", V: "buyer@mail.com", O: "4.99", R: "14:36" }),   // second pack, same order
  row({ D: "M6", T: "itunes usd", U: "รอเติม", V: "late@mail.com", O: "3" }),       // no time yet: not moved
  row({ D: "M2", T: "CodashopUSD", U: "รอเติม", V: "", O: "5" }),                   // no email: not iTunes
  row({ D: "M3", T: "de", U: "เรียบร้อย", V: "x@y.de", O: "5" }),                    // done: skipped
  row({ D: "M4", T: "Codashop", U: "รอเติม", V: "ยกยอด", O: "5" }),                  // note, not an email
  row({ D: "M5", T: "something", U: "รอเติม", V: "z@y.de", O: "5" }),               // email but unknown channel
];
const found = extractItunesRows("marketplace", tab, { sheetDate: "2026-10-18", tab: "18/10/2026" });
check(found.orders.length === 2 && found.issues.length === 1 && found.withoutTime === 1, "rows without a time wait");
check(found.orders[0].time === "14:35");
const d = found.orders[0].details;
check(d.saleThb === "350.00" && d.customer === "Somchai" && d.link === "https://shop/x" && d.game === "Genshin" && d.pack === "Welkin" && d.playerId === "800123");
check(found.orders[0].email === "buyer@mail.com" && found.orders[0].currency === "USD" && found.orders[0].amount === "9.99" && found.orders[0].row === 2);
check(found.orders[0].key === "marketplace|2026-10-18|M1|1" && found.orders[1].key === "marketplace|2026-10-18|M1|2", "each pack row has its own key");
check(found.issues[0].orderId === "M5");

// Order Page / inblackm keep the email in U (status Q, amount N, time M); R is not read.
const pageTab = [
  row({ C: "P1", S: "itunes usd", Q: "รอเติม", U: "page@mail.com", N: "7", M: "10:00" }),
  row({ C: "P2", S: "itunes usd", Q: "รอเติม", R: "wrong@mail.com", N: "7", M: "10:00" }),
];
for (const source of ["page", "inblackm"]) {
  const got = extractItunesRows(source, pageTab, { sheetDate: "2026-10-18", tab: "18/10/2026" });
  check(got.orders.length === 1 && got.orders[0].email === "page@mail.com" && got.orders[0].amount === "7.00", `${source} email in U`);
}
check(JSON.stringify(daysToRead("2026-10-20", { includeOlder: false })) === JSON.stringify(["2026-10-20", "2026-10-19"]));
check(JSON.stringify(daysToRead("2026-10-20", { includeOlder: true })) === JSON.stringify(["2026-10-20", "2026-10-19", "2026-10-18"]));
check(daysToRead("2026-10-18", { includeOlder: true }).length === 1 && daysToRead("2026-10-17", { includeOlder: true }).length === 0, "never before the start date");
check(thaiToday(new Date("2026-10-18T18:30:00Z")) === "2026-10-19", "Thai calendar day");

// Reader: picks today's daily files and dated tabs, ignores other days; a failing source does not stop the rest.
// Russia: K (THB) is 0 until F is pasted into E; the reader pastes it once, then rereads.
let russiaRows = [row({ I: "R1", Y: "ITUNES(DE)", Z: "รอเติม", AA: "de@mail.com", T: "20", W: "09:10", F: "1.5", K: "0" }),
  row({ I: "R2", Y: "CodashopUSD", Z: "รอเติม", F: "3", K: "0" })];
const writes = [];
const reads = [];
const reader = {
  async listSpreadsheets(q) {
    if (q.includes("'RF' in parents")) return [{ id: "r18", name: "0.1 Order Russia Reseller 18/10/2026 Bot2" }, { id: "r10", name: "0.1 Order Russia Reseller 10/10/2026 Bot2" }];
    if (q.includes("'IF' in parents")) throw new Error("403 forbidden");
    if (q.includes("0.3 ORDER PAGE")) return [{ id: "page" }];
    if (q.includes("Market Place BOT")) return [{ id: "mp" }];
    return [];
  },
  async tabTitles(id) { return id === "page" ? ["17/10/2026", "template"] : ["18/10/2026", "01/9/2026"]; },
  async rows(id, tabName) { reads.push(`${id}:${tabName}`); return id === "r18" ? russiaRows : id === "mp" ? tab : []; },
  async writeRaw(id, updates) {
    writes.push({ id, updates });
    russiaRows = russiaRows.map((r, i) => { const n = [...r]; if (i === 0) { n[columnIndex("E")] = "1.5"; n[columnIndex("K")] = "54.30"; } return n; });
  },
};
const cfg = { russiaFolder: "RF", pageFolder: "PF", inblackmFolder: "IF", marketplaceIds: [] };
const read = await readSheetOrders(reader, ["2026-10-18"], cfg);
check(read.orders.length === 3 && read.withoutTime === 1 && read.orders.some((o) => o.source === "russia" && o.currency === "DE" && o.amount === "20.00" && o.time === "09:10"));
check(!reads.some((r) => r.startsWith("r10") || r.includes("01/9/2026") || r.startsWith("page")), "other days are not read");
check(read.errors.length === 1 && read.errors[0].source === "inblackm");
check(writes.length === 1 && writes[0].updates.length === 1 && writes[0].updates[0].range === "'0.1 Order Russia Reseller 18/10/2026 Bot2'!E1" && writes[0].updates[0].value === "1.5", "only the iTunes row's empty E is written");
check(read.filled === 1 && read.orders.find((o) => o.source === "russia").details.saleThb === "54.30", "THB read after the paste");

// Import: deducts once, records cost at the multiplier in force, and skips unknown/mismatched emails.
function fakeClient({ entries, rate = "35.5", existing = false }) {
  const calls = [];
  return { calls, async query(sql, params = []) {
    calls.push({ sql, params });
    if (sql.includes("SELECT 1 FROM projectm_itune_sheet_imports")) return { rows: existing ? [{}] : [] };
    if (sql.includes("FROM projectm_itune_entries")) return { rows: entries };
    if (sql.includes("FROM projectm_itune_cost_rates")) return { rows: rate ? [{ rate }] : [] };
    if (sql.includes("RETURNING id")) return { rows: [{ id: 1 }] };
    return { rows: [], rowCount: 1 };
  } };
}
const order = found.orders[0];
let client = fakeClient({ entries: [{ id: 7, email: "Buyer@Mail.com", currency: "usd", amount: "50.00" }] });
let result = await importSheetOrder(client, order);
check(result.status === "imported" && result.entryId === 7 && !result.negative);
const update = client.calls.find((c) => c.sql.startsWith("UPDATE projectm_itune_entries"));
check(update.params[0] === 40.01, "50.00 - 9.99");
const insert = client.calls.find((c) => c.sql.includes("INSERT INTO projectm_itune_sheet_imports"));
check(insert.params[0] === order.key && insert.params[13] === "35.5" && insert.params[14] === "354.65" && insert.params[15] === "14:35", "cost = 9.99 × 35.5, time kept");
check(client.calls.some((c) => c.sql.includes("projectm_itune_amount_log")) && client.calls.at(-1).sql === "COMMIT");
client = fakeClient({ entries: [{ id: 7, email: "b", currency: "USD", amount: "5" }], rate: null });
result = await importSheetOrder(client, order);
check(result.negative && client.calls.find((c) => c.sql.includes("INSERT INTO projectm_itune_sheet_imports")).params[14] === null, "no multiplier yet: cost stays empty");
for (const [setup, status] of [[{ entries: [] }, "no_email"], [{ entries: [{ id: 1 }, { id: 2 }] }, "duplicate_email"],
  [{ entries: [{ id: 1, currency: "DE", amount: "5" }] }, "currency_mismatch"]]) {
  client = fakeClient(setup); result = await importSheetOrder(client, order);
  check(result.status === status && !client.calls.some((c) => c.sql.startsWith("UPDATE")) && client.calls.at(-1).sql === "ROLLBACK", status);
}
client = fakeClient({ entries: [], existing: true }); result = await importSheetOrder(client, order);
const refresh = client.calls.find((c) => c.sql.includes("UPDATE projectm_itune_sheet_imports SET"));
check(result.status === "already" && refresh && refresh.params[1] === "350.00" && refresh.params[4] === "Genshin" && client.calls.at(-1).sql === "COMMIT"
  && !client.calls.some((c) => c.sql.includes("projectm_itune_entries SET")), "a seen-again row only refreshes its details");

// JWT: RS256 over header.claims with the read-only scopes.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwt = signServiceAccountJwt({ client_email: "sa@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }, 1_700_000_000_000);
const [h, c, sig] = jwt.split(".");
const verify = createVerify("RSA-SHA256"); verify.update(`${h}.${c}`);
check(verify.verify(publicKey, Buffer.from(sig, "base64url")));
const claims = JSON.parse(Buffer.from(c, "base64url").toString());
check(claims.scope.includes("auth/spreadsheets ") && claims.scope.includes("drive.readonly") && !claims.scope.includes("auth/drive ") && claims.exp - claims.iat === 3600);
// Access: admins see every email; topup users only the one they hold.
const holderPool = (held) => ({ async query(sql, params) { return { rows: held && params[1] === 5 ? [{}] : [] }; } });
check(await assertEntryAccess(holderPool(false), "9", { id: 1, permissions: ["projectm.admin"] }) === 9);
check(await assertEntryAccess(holderPool(true), 9, { id: 5, permissions: ["projectm.claim"] }) === 9);
await assert.rejects(assertEntryAccess(holderPool(true), 9, { id: 6, permissions: ["projectm.claim"] }), { status: 403 }); passed++;
await assert.rejects(assertEntryAccess(holderPool(true), 9, { id: 5, permissions: [] }), { status: 403 }); passed++;
await assert.rejects(assertEntryAccess(holderPool(true), "x", { id: 1, permissions: ["projectm.admin"] }), { status: 404 }); passed++;
console.log(`${passed} passed`);
