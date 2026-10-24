import assert from "node:assert/strict";
import { getWorkforceWebPool, readWorkforceSource } from "../src/server/workforce-repository.js";
import { WEB_SOURCE } from "../src/server/workforce-sources.js";

let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`ok ${name}`); }
const range = { from: "2026-10-23T09:00:00+07:00", to: "2026-10-24T09:00:00+07:00" };
function fakePool({ schema = [], error } = {}) {
  const calls = [];
  let released = false;
  return {
    calls, get released() { return released; },
    async connect() {
      return {
        async query(sql, values) {
          calls.push({ sql, values });
          if (sql.includes("information_schema.columns")) return { rows: schema };
          if (sql.startsWith("WITH raw")) {
            if (error) throw error;
            return { rows: [{ channel: "web", orders: 1, units: 2 }] };
          }
          return { rows: [] };
        },
        release() { released = true; },
      };
    },
  };
}
const schema = ["id", "order_id", "status", "quantity", "created_at"].map(column_name => ({
  table_name: "queue_bot_orders", column_name,
  data_type: column_name === "created_at" ? "timestamp without time zone" : "text",
}));

await check("missing dedicated web URL does not reuse the tools PG database", () => {
  const saved = process.env.WORKFORCE_WEB_DATABASE_URL;
  delete process.env.WORKFORCE_WEB_DATABASE_URL;
  try { assert.equal(getWorkforceWebPool(), null); }
  finally { if (saved !== undefined) process.env.WORKFORCE_WEB_DATABASE_URL = saved; }
});
await check("read source binds dates, enforces read-only, rolls back and releases", async () => {
  const pool = fakePool({ schema });
  const result = await readWorkforceSource(pool, [WEB_SOURCE], range);
  assert.equal(result.rows[0].units, 2);
  assert.equal(result.sources[0].available, true);
  assert.equal(pool.calls[0].sql, "BEGIN READ ONLY");
  assert.ok(pool.calls.some(c => c.sql.includes("statement_timeout='25000'")));
  const select = pool.calls.find(c => c.sql.startsWith("WITH raw"));
  assert.deepEqual(select.values, [range.from, range.to]);
  assert.equal(pool.calls.at(-1).sql, "ROLLBACK");
  assert.equal(pool.released, true);
});
await check("missing tables skip source SQL instead of issuing an invalid query", async () => {
  const pool = fakePool();
  const result = await readWorkforceSource(pool, [WEB_SOURCE], range);
  assert.equal(result.sources[0].available, false);
  assert.deepEqual(result.rows, []);
  assert.equal(pool.calls.some(c => c.sql.startsWith("WITH raw")), false);
  assert.equal(pool.released, true);
});
await check("query timeout is propagated only after rollback and release", async () => {
  const error = Object.assign(new Error("query cancelled"), { code: "57014" });
  const pool = fakePool({ schema, error });
  await assert.rejects(readWorkforceSource(pool, [WEB_SOURCE], range), e => e === error);
  assert.equal(pool.calls.at(-1).sql, "ROLLBACK");
  assert.equal(pool.released, true);
});
console.log(`\n${passed} passed, 0 failed`);
