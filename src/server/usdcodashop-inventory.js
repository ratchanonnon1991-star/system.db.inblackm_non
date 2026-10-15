import { getPool } from "@/lib/db";
import { normalizeUsdInventory, mapUsdInventory, inventoryError, canViewUsdInventory, canManageUsdInventory } from "@/lib/usdcodashop-inventory";

const schemas = new WeakMap();
export async function ensureUsdInventorySchema(pool) {
  if (!schemas.has(pool)) schemas.set(pool, (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('gamedb-usd-inventory-schema'))");
      await client.query(`CREATE TABLE IF NOT EXISTS gamedb_usdcodashop_inventory (
        id BIGSERIAL PRIMARY KEY, request_id UUID NOT NULL UNIQUE,
        account_name VARCHAR(160) NOT NULL, status VARCHAR(32) NOT NULL CHECK (status IN ('ปกติ','ระงับใช้งาน')),
        current_amount NUMERIC(14,2) NOT NULL CHECK (current_amount >= 0),
        used_amount NUMERIC(14,2) NOT NULL CHECK (used_amount >= 0 AND used_amount <= current_amount),
        created_by_user_id INTEGER NOT NULL, created_by_label TEXT NOT NULL,
        updated_by_user_id INTEGER NOT NULL, updated_by_label TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await client.query(`CREATE TABLE IF NOT EXISTS gamedb_usdcodashop_inventory_log (
        id BIGSERIAL PRIMARY KEY, entry_id BIGINT NOT NULL REFERENCES gamedb_usdcodashop_inventory(id),
        action VARCHAR(16) NOT NULL, actor_id INTEGER NOT NULL, actor_label TEXT NOT NULL,
        before_data JSONB, after_data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  })().catch((error) => { schemas.delete(pool); throw error; }));
  await schemas.get(pool);
}

export function createUsdInventoryRepository(pool) {
  return {
    async list(actor) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Inventory", 403);
      await ensureUsdInventorySchema(pool);
      const { rows } = await pool.query("SELECT * FROM gamedb_usdcodashop_inventory ORDER BY id DESC LIMIT 1001");
      return { entries: rows.slice(0, 1000).map(mapUsdInventory), hasMore: rows.length > 1000, canManage: canManageUsdInventory(actor) };
    },
    async save(body, actor, id = null) {
      if (!canManageUsdInventory(actor)) throw inventoryError("ต้องมีสิทธิ์ Projectm Admin เพื่อเพิ่มหรือแก้ไข Inventory", 403);
      const fields = normalizeUsdInventory(body);
      if (id !== null && (!/^[1-9]\d{0,17}$/.test(String(id)) || !Number.isSafeInteger(body.version) || body.version < 1)) throw inventoryError("รหัสรายการหรือเวอร์ชันไม่ถูกต้อง");
      if (id === null && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || "")) throw inventoryError("รหัสคำขอไม่ถูกต้อง");
      await ensureUsdInventorySchema(pool);
      const client = await pool.connect();
      const label = actor.displayName || actor.username || `User #${actor.id}`;
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='10s'");
        let before = null; let row;
        if (id !== null) {
          before = (await client.query("SELECT * FROM gamedb_usdcodashop_inventory WHERE id=$1 FOR UPDATE", [id])).rows[0];
          if (!before) throw inventoryError("ไม่พบรายการ", 404);
          if (Number(before.version) !== body.version) throw inventoryError("รายการถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", 409);
          row = (await client.query(`UPDATE gamedb_usdcodashop_inventory SET account_name=$2,status=$3,current_amount=$4,used_amount=$5,
            updated_by_user_id=$6,updated_by_label=$7,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, fields.name, fields.status, fields.current, fields.used, actor.id, label])).rows[0];
        } else {
          row = (await client.query(`INSERT INTO gamedb_usdcodashop_inventory
            (request_id,account_name,status,current_amount,used_amount,created_by_user_id,created_by_label,updated_by_user_id,updated_by_label)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7) ON CONFLICT(request_id) DO NOTHING RETURNING *`,
          [body.requestId, fields.name, fields.status, fields.current, fields.used, actor.id, label])).rows[0];
          if (!row) {
            const previous = (await client.query("SELECT * FROM gamedb_usdcodashop_inventory WHERE request_id=$1", [body.requestId])).rows[0];
            if (!previous || String(previous.created_by_user_id) !== String(actor.id) || previous.account_name !== fields.name || previous.status !== fields.status ||
                mapUsdInventory(previous).current !== fields.current || mapUsdInventory(previous).used !== fields.used) throw inventoryError("รหัสคำขอถูกใช้แล้ว กรุณาโหลดใหม่", 409);
            await client.query("COMMIT"); return mapUsdInventory(previous);
          }
        }
        await client.query(`INSERT INTO gamedb_usdcodashop_inventory_log (entry_id,action,actor_id,actor_label,before_data,after_data)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [row.id, before ? "update" : "create", actor.id, label, before ? JSON.stringify(mapUsdInventory(before)) : null, JSON.stringify(mapUsdInventory(row))]);
        await client.query("COMMIT"); return mapUsdInventory(row);
      } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
      finally { client.release(); }
    },
  };
}
let repository;
export const usdInventoryRepository = () => repository ||= createUsdInventoryRepository(getPool());
