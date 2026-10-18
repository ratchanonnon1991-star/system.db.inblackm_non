import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createMgcCostSettings } from "../src/server/multigamecard-cost-settings.js";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const client = { query: (sql, args) => db.query(sql, args), release() {} };
const repo = createMgcCostSettings({ query: client.query, connect: async () => client });
const admin = { id: 1, username: "Admin", permissions: ["projectm.admin"] }, viewer = { id: 2, permissions: ["projectm.claim"] };
try {
  await assert.rejects(repo.read({ permissions: [] }), { status: 403 });
  await assert.rejects(repo.save({ divisor: "25", version: "0" }, viewer), { status: 403 });
  assert.equal((await repo.read(viewer)).divisor, "33.31534305");
  const saved = await repo.save({ divisor: "25", version: "0" }, admin);
  assert.equal(saved.divisor, "25.00000000"); assert.equal(saved.updatedBy, "Admin");
  assert.equal((await repo.read(viewer)).version, saved.version);
  await assert.rejects(repo.save({ divisor: "30", version: "0" }, admin), { status: 409 });
  for (const divisor of ["0", "-1", "bad", "1.123456789"]) await assert.rejects(repo.save({ divisor, version: saved.version }, admin), { status: 400 });
  await repo.save({ divisor: "32", version: saved.version }, admin);
  const history = (await db.query("SELECT divisor::text,actor_id FROM gamedb_mgc_cost_rates ORDER BY version")).rows;
  assert.deepEqual(history.map(r => r.divisor), ["25.00000000", "32.00000000"]);
  assert.ok(history.every(r => r.actor_id === 1));
  console.log("PASS: persisted shared cost divisor, default, permissions, invalid input, stale-write prevention, append-only audit");
} finally { await db.close(); }
