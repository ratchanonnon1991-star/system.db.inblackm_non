import assert from "node:assert/strict";
import { createGarenaShellInventory, enrichShellOrders } from "../src/server/garena-shell-inventory.js";
import { SHELL_ACCOUNTS, shellAccount, shellFilters, shellUsage, shellCost, shellOrder, shellSummary, shellCsv } from "../src/lib/garena-shell-inventory.js";

let passed = 0;
const check = (value, message) => { assert.ok(value, message); passed++; };
const actor = { id: 16, permissions: ["projectm.admin"] };
const dates = { dateFrom: "2026-10-01", dateTo: "2026-10-19" };
const base = { id: 1, garena_username: "InblackRB2c", source_order_id: "K1", shell_before: "1000", shell_after: "700", shell_used: "300",
  game_name: "ROV", pack_name: "300 Shell", occurred_at: "2026-10-18T07:00:00Z", observed_at: "2026-10-18T07:01:00Z", sheet_fields: { saleThb: "190" } };
check(SHELL_ACCOUNTS.length === 2 && shellAccount(" inBLACKrb2C ").id === "inblackrb2c");
check(shellAccount("InblackKAN2bb") === null && shellAccount("1") === null, "never infer account from mutable index");
check(shellFilters(dates).bounds.start === "2026-09-30T17:00:00.000Z");
check(shellFilters(dates).bounds.end === "2026-10-19T17:00:00.000Z");
for (const query of [{}, { ...dates, account: "other" }, { dateFrom: "2026-01-01", dateTo: "2026-10-19" }, { dateFrom: "2026-02-30", dateTo: "2026-03-01" }]) {
  assert.throws(() => shellFilters(query), { status: 400 }); passed++;
}
check(shellUsage(base).used === "300.00");
check(shellUsage({ shell_used: "135" }).usageSource === "shell_used");
check(shellUsage({ ...base, shell_used: "200" }).used === null, "conflicting before/after and amount are not guessed");
check(shellUsage({ shell_before: "1", shell_after: "2", shell_used: "1" }).used === null);
check(shellUsage({ shell_cost_expected: "300" }).used === null, "expected cost is not proof of actual spend");
check(shellCost("300") === "187.50" && shellCost("135") === "84.38", "0.625 THB per Shell with half-up satang rounding");
check(shellCost("0") === "0.00" && shellCost(null) === null);
const entry = shellOrder(base);
check(entry.figures.profit === "2.50" && entry.figures.margin === "1.32");
check(entry.balance === "700.00" && entry.account === "inblackrb2c");
check(shellOrder({ ...base, garena_username: "InblackKAN1aa" }) === null);
check(!JSON.stringify(entry).includes("shell_before"), "safe normalized response");
const missing = shellOrder({ ...base, id: 2, sheet_fields: {}, shell_used: null, shell_before: null, shell_after: null });
const incomplete = shellSummary([entry, missing]);
check(incomplete.sale === null && incomplete.cost === null && incomplete.used === null && incomplete.profit === null);
check(incomplete.missingSales === 1 && incomplete.missingCosts === 1);
check(shellSummary([]).sale === "0.00" && shellSummary([]).used === "0.00", "actual empty result is zero, not missing");
const loss = shellOrder({ ...base, sheet_fields: { saleThb: "100" } });
check(shellSummary([entry, loss]).profit === "-85.00", "losses net against gains");
const csv = shellCsv([{ ...entry, orderId: "=HYPERLINK(\"evil\")", details: { ...entry.details, game: "+CMD", invoice: "@evil" } }]);
check(csv.startsWith("\uFEFF") && csv.includes("Shell ออก") && csv.includes("'@evil") && csv.includes("'+CMD") && csv.includes("'=HYPERLINK"));

const calls = [];
const rows = [base, { ...base, id: 2, source_order_id: "K2", garena_username: "InblackWFH1z" }];
const repo = createGarenaShellInventory({
  select: async (sql, params) => {
    calls.push({ sql, params });
    return sql.includes("DISTINCT ON") ? [{ ...base, shell_after: "9000", observed_at: "2026-10-20T00:00:00Z" }] : rows;
  },
  enrich: async (_select, data) => data,
  prepareSales: async (data) => data,
});
const result = await repo.list(actor, { ...dates, account: "inblackrb2c", search: "K1" });
check(result.cards.length === 2 && result.total === 1 && result.entries[0].orderId === "K1");
check(result.cards[0].balance === "9000.00" && result.cards[1].balance === null, "latest bot balance independent of the reporting period");
check(result.cards[0].reference.remaining === "124050.00" && result.cards[0].balance !== result.cards[0].reference.remaining, "sheet reference never adjusts bot balance");
check(calls.every((c) => c.sql.trim().startsWith("SELECT")), "remote DB remains SELECT-only");
check(calls.every((c) => c.sql.includes("c.status='completed'") && c.sql.includes("ANY($2::text[])")));
check(calls.every((c) => c.params[0] === "GarenaShells" && c.params[1].join() === "inblackrb2c,inblackwfh1z"));
check(calls.every((c) => !/SELECT\s+(?:\*|c\.\*)|->>'(?:session|password|cookies)'/.test(c.sql)), "no raw provider responses, passwords or sessions selected");
const reads = calls.length;
await assert.rejects(repo.list({ permissions: [] }, dates), { status: 403 }); passed++;
check(calls.length === reads, "authorize before any DB read");
const viewer = await repo.list({ permissions: ["projectm.claim"] }, dates);
check(viewer.total === 2);
const duplicate = createGarenaShellInventory({ select: async (sql) => sql.includes("DISTINCT ON") ? [] : [base, base] });
await assert.rejects(duplicate.list(actor, dates), { status: 409 }); passed++;

let pages = 0;
const paged = createGarenaShellInventory({ select: async (sql, params) => {
  if (sql.includes("DISTINCT ON")) return [];
  pages++;
  if (params[2] !== "0") return [];
  return Array.from({ length: 500 }, (_, i) => ({ ...base, id: i + 1, source_order_id: `K${i + 1}` }));
}, enrich: async (_select, data) => data, prepareSales: async (data) => data });
const many = await paged.list(actor, { ...dates, page: 2 });
check(pages === 2 && many.total === 500 && many.entries.length === 100 && many.summary.orders === 500);
const all = await paged.list(actor, dates, { exportAll: true });
check(all.entries.length === 500 && all.total === 500, "CSV includes all matched pages");

const slashId = "IN430910-6066-1/1";
const slashFields = await enrichShellOrders(async (sql, params) => {
  check(params[0].length === 1 && params[0][0] === slashId, "sale and pack count retain the complete purchased-unit ID");
  if (sql.includes("AS sale_key")) {
    check(sql.includes("split_part(c.source_order_id::text,':',1)") && !sql.includes("'/',1"), "SQL does not collapse sibling /1 and /2 units");
    return [{ sale_key: slashId, pack_count: 1 }];
  }
  return [];
}, [{ ...base, id: 292325, source_order_id: `${slashId}:dispatch-uuid:1`, source_base: slashId,
  sale_order_id: slashId, sale_price: "475.00", source: "PAGE", shell_before: "69300", shell_after: "68550", shell_used: "750" }]);
const slashEntry = shellOrder(slashFields[0]);
check(slashEntry.figures.sale === "475.00" && slashEntry.figures.cost === "468.75");
check(slashEntry.figures.profit === "6.25" && slashEntry.figures.margin === "1.32");
console.log(`${passed} passed`);
