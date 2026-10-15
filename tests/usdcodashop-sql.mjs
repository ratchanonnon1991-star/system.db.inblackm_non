// Optional SQL verification: provide PGLITE_MODULE pointing to an installed
// PGlite ES module. Does not connect to application databases.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createUsdInventoryRepository } from "../src/server/usdcodashop-inventory.js";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const client = { query: (sql, params) => db.query(sql, params), release() {} };
const pool = { query: client.query, connect: async () => client };
const admin = { id: 16, username: "khong", permissions: ["projectm.admin", "projectm.claim"] };
const repo = createUsdInventoryRepository(pool);
try {
  const body = { name: "[BOT] (USD) Codashop", status: "ปกติ", current: "15,665.80", used: "1,047.79", requestId: "00000000-0000-4000-8000-000000000001" };
  const entry = await repo.save(body, admin);
  assert.equal(entry.remaining, "14618.01"); assert.equal(entry.createdBy, "khong");
  const replay = await repo.save(body, admin); assert.equal(entry.id, replay.id);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM gamedb_usdcodashop_inventory_log")).rows[0].count, 1);
  const update = await repo.save({ ...body, used: "1,048.79", version: entry.version }, admin, entry.id);
  assert.equal(update.remaining, "14617.01"); assert.equal(update.version, 2);
  await assert.rejects(repo.save({ ...body, version: entry.version }, admin, entry.id), { status: 409 });
  assert.equal((await repo.list(admin)).entries[0].used, "1048.79");
  const audit = (await db.query("SELECT * FROM gamedb_usdcodashop_inventory_log WHERE action='update'")).rows[0];
  assert.equal(audit.before_data.used, "1047.79"); assert.equal(audit.after_data.used, "1048.79");
  // A failed audit must roll the account change back with it.
  await db.exec("ALTER TABLE gamedb_usdcodashop_inventory_log ADD CONSTRAINT test_audit_reject CHECK(action <> 'update') NOT VALID");
  await assert.rejects(repo.save({ ...body, used: "2000.00", version: 2 }, admin, entry.id));
  assert.equal((await repo.list(admin)).entries[0].used, "1048.79");
  console.log("PASS: actual PostgreSQL-compatible DDL, precise amounts, insert/update, audit, retry idempotency, stale-version protection and rollback");
} finally { await db.close(); }
