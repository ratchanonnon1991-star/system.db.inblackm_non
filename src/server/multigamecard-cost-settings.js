import { getPool } from "@/lib/db";
import { canManageUsdInventory, canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { MGC_COST_DIVISOR, mgcCostDivisor } from "@/lib/multigamecard-inventory";

const schemas = new WeakMap();
async function ensure(pool) {
  if (!schemas.has(pool)) schemas.set(pool, (async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SELECT pg_advisory_xact_lock(hashtext('gamedb-mgc-cost-schema'))");
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_mgc_cost_rates (
        version BIGSERIAL PRIMARY KEY, divisor NUMERIC(16,8) NOT NULL CHECK(divisor>0),
        actor_id INTEGER NOT NULL, actor_label TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  })().catch(e => { schemas.delete(pool); throw e; }));
  await schemas.get(pool);
}
const latest = `SELECT version::text,divisor::text,actor_label AS "updatedBy",updated_at AS "updatedAt"
  FROM gamedb_mgc_cost_rates ORDER BY version DESC LIMIT 1`;
const defaultRate = () => ({ version: "0", divisor: MGC_COST_DIVISOR, updatedBy: null, updatedAt: null });
export function createMgcCostSettings(pool) {
  return {
    async read(actor) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Multigamecard", 403);
      await ensure(pool);
      return (await pool.query(latest)).rows[0] || defaultRate();
    },
    async save(body, actor) {
      if (!canManageUsdInventory(actor)) throw inventoryError("เฉพาะ Projectm Admin จึงเปลี่ยนตัวหารได้", 403);
      const divisor = mgcCostDivisor(body.divisor);
      if (!/^(0|[1-9]\d{0,15})$/.test(String(body.version ?? ""))) throw inventoryError("กรุณาโหลดเรทล่าสุดก่อนบันทึก");
      await ensure(pool);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SET LOCAL lock_timeout='5s'");
        await c.query("SELECT pg_advisory_xact_lock(hashtext('gamedb-mgc-cost-save'))");
        const previous = (await c.query(latest)).rows[0] || defaultRate();
        if (String(previous.version) !== String(body.version)) throw inventoryError("มีคนเปลี่ยนเรทแล้ว กรุณาโหลดใหม่ก่อนบันทึก", 409);
        const result = await c.query(`INSERT INTO gamedb_mgc_cost_rates(divisor,actor_id,actor_label)
          VALUES($1,$2,$3) RETURNING version::text,divisor::text,actor_label AS "updatedBy",updated_at AS "updatedAt"`,
        [divisor, actor.id, String(actor.displayName || actor.username || `User #${actor.id}`).slice(0, 160)]);
        await c.query("COMMIT"); return result.rows[0];
      } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
      finally { c.release(); }
    },
  };
}
let repo;
export const mgcCostSettings = () => repo ||= createMgcCostSettings(getPool());
