import { getPool } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { findUserById, findUserByUsername } from "@/server/users-repository";
import { getReadyPool, getItuneClaimSettings, listClaimedItuneEntriesForUser } from "@/server/itune-entries-repository";
import { compareItuneQueueEntries } from "@/lib/itune-queue";
import { ITUNE_UNAVAILABLE_STATUS } from "@/lib/itune-status";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max = 128) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
let mappingReady;
async function mappingPool() {
  const pool = getPool();
  if (!mappingReady) {
    mappingReady = pool.query(`CREATE TABLE IF NOT EXISTS gamedb_itune_order_accounts (
      external_user_id VARCHAR(128) PRIMARY KEY,
      gamedb_user_id INTEGER NOT NULL UNIQUE,
      updated_by INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).catch((err) => { mappingReady = null; throw err; });
  }
  await mappingReady;
  return pool;
}

export async function listOrderAccounts() {
  const pool = await mappingPool();
  const { rows } = await pool.query("SELECT * FROM gamedb_itune_order_accounts ORDER BY external_user_id");
  return Promise.all(rows.map(async (row) => {
    const user = await findUserById(row.gamedb_user_id);
    return { externalUserId: row.external_user_id, userId: row.gamedb_user_id, username: user?.username || "บัญชีถูกลบ", updatedAt: row.updated_at };
  }));
}

export async function saveOrderAccount(body, actor) {
  const externalId = text(body.externalUserId);
  if (!externalId) fail("ระบุ User ID ของ inblackm");
  const pool = await mappingPool();
  if (body.remove === true) {
    await pool.query("DELETE FROM gamedb_itune_order_accounts WHERE external_user_id=$1", [externalId]);
    return;
  }
  const user = await findUserByUsername(text(body.username));
  if (!user || !hasPermission(user, "projectm.claim")) fail("ไม่พบบัญชีที่มีสิทธิ์ Topup");
  try {
    await pool.query(`INSERT INTO gamedb_itune_order_accounts (external_user_id,gamedb_user_id,updated_by)
      VALUES ($1,$2,$3) ON CONFLICT (external_user_id) DO UPDATE SET
      gamedb_user_id=EXCLUDED.gamedb_user_id,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [externalId, user.id, actor.id]);
  } catch (err) { if (err.code === "23505") fail("บัญชีนี้ถูกจับคู่กับ User ID อื่นแล้ว", 409); throw err; }
}

async function resolveActor(externalId) {
  if (!text(externalId)) fail("Invalid actor");
  const pool = await mappingPool();
  const { rows } = await pool.query("SELECT gamedb_user_id FROM gamedb_itune_order_accounts WHERE external_user_id=$1", [externalId]);
  const actor = rows[0] && await findUserById(rows[0].gamedb_user_id);
  if (!actor || !hasPermission(actor, "projectm.claim")) fail("ยังไม่ได้จับคู่บัญชีพนักงานกับ iTune หรือบัญชีไม่มีสิทธิ์ Topup", 403);
  return actor;
}

// Lives beside claim sessions in the iTune database, not in the Orders database.
// No credentials, proof images or customer login data are copied into this log.
const usageSchemas = new WeakMap();
export async function usagePool() {
  const pool = await getReadyPool();
  if (!usageSchemas.has(pool)) usageSchemas.set(pool, (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS projectm_itune_order_usage (
    id UUID PRIMARY KEY, order_id VARCHAR(128) NOT NULL, line_id VARCHAR(128) NOT NULL DEFAULT '',
    entry_id INTEGER NOT NULL, claim_session_id BIGINT NOT NULL, user_id INTEGER NOT NULL,
    external_user_id VARCHAR(128) NOT NULL, email VARCHAR(320) NOT NULL, currency VARCHAR(64) NOT NULL,
    game_name VARCHAR(256) NOT NULL DEFAULT '', package_label VARCHAR(256) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','completed','cancelled')),
    used_amount NUMERIC(14,2), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ,
    cancel_reason VARCHAR(128), cancelled_by_user_id INTEGER, cancelled_by_external_id VARCHAR(128)
  )`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS itune_order_one_plan ON projectm_itune_order_usage(order_id,line_id) WHERE status='planned'");
  await pool.query("CREATE INDEX IF NOT EXISTS itune_order_entry_history ON projectm_itune_order_usage(entry_id,created_at DESC)");
  })().catch((err) => { usageSchemas.delete(pool); throw err; }));
  await usageSchemas.get(pool);
  return pool;
}

function summary(row) {
  return { id: row.id, orderId: row.order_id, lineId: row.line_id, entryId: row.entry_id,
    claimSessionId: String(row.claim_session_id), email: row.email, currency: row.currency,
    gameName: row.game_name, packageLabel: row.package_label, status: row.status,
    usedAmount: row.used_amount === null ? null : Number(row.used_amount), createdAt: row.created_at,
    finishedAt: row.finished_at, cancelReason: row.cancel_reason, userId: row.user_id,
    cancelledByUserId: row.cancelled_by_user_id };
}

export async function entryOrderHistory(entryId, actor) {
  if (!Number.isSafeInteger(Number(entryId)) || Number(entryId) <= 0) fail("Invalid email ID");
  const pool = await usagePool();
  const admin = hasPermission(actor, "projectm.admin");
  const { rows } = await pool.query(`SELECT * FROM projectm_itune_order_usage WHERE entry_id=$1
    AND ($2::boolean OR user_id=$3) ORDER BY created_at DESC LIMIT 100`, [entryId, admin, actor.id]);
  return rows.map(summary);
}

export async function runOrderBridge(body, deadline = Date.now() + 7000) {
  const actor = await resolveActor(body.actorId);
  const orderId = text(body.order?.id);
  const lineId = text(body.order?.lineId ?? "");
  if (!orderId || !["list", "plan", "confirm", "cancel"].includes(body.action)) fail("Invalid order request");
  const pool = await usagePool();
  if (body.action === "list") {
    const entries = await listClaimedItuneEntriesForUser(actor.id);
    const settings = await getItuneClaimSettings();
    const now = Date.now();
    const available = entries.filter((e) => e.activeClaimSessionId && !e.hasPendingReject && e.status !== ITUNE_UNAVAILABLE_STATUS && Number(e.amount) > 0);
    available.sort((a,b) => compareItuneQueueEntries(a,b,settings,now));
    const { rows } = await pool.query("SELECT * FROM projectm_itune_order_usage WHERE order_id=$1 AND line_id=$2 ORDER BY created_at DESC LIMIT 100", [orderId, lineId]);
    return { entries: available.map((e,index) => ({
      id: e.id, email: e.email, currency: e.currency, amount: e.amount,
      claimedAt: e.claimedAt, createdAt: e.createdAt, priorityOrder: e.priorityOrder, recommended: index === 0,
      claimSessionId: String(e.activeClaimSessionId),
    })), history: rows.map(summary) };
  }
  const payload = body.payload || {};
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.id || "")) fail("Invalid operation ID");
  let amount;
  if (body.action === "confirm") {
    if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(String(payload.usedAmount ?? ""))) fail("ระบุยอดที่ใช้จริงไม่เกิน 2 ทศนิยม");
    amount = Number(payload.usedAmount);
    if (amount <= 0) fail("ยอดที่ใช้จริงต้องมากกว่า 0");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`itune-order:${orderId}:${lineId}`]);
    const existing = (await client.query("SELECT * FROM projectm_itune_order_usage WHERE id=$1 FOR UPDATE", [payload.id])).rows[0];
    if (existing && (existing.order_id !== orderId || existing.line_id !== lineId ||
      (body.action !== "cancel" && (existing.user_id !== actor.id || existing.external_user_id !== body.actorId)))) fail("รายการนี้ไม่ใช่ของบัญชีหรือ Order นี้", 403);
    // Retrying a successful request must not create a second history record.
    if (existing && body.action === "plan") {
      if (String(existing.entry_id) !== String(payload.entryId) || String(existing.claim_session_id) !== String(payload.claimSessionId)) fail("Operation ID ถูกใช้งานแล้ว", 409);
    } else if (existing?.status === "completed" && body.action === "confirm") {
      if (Number(existing.used_amount) !== amount) fail("ยอดที่ยืนยันแล้วไม่ตรงกัน", 409);
    } else if (existing?.status === "cancelled" && body.action === "cancel") {
      // Idempotent cancellation.
    } else {
      if (body.action !== "plan" && (!existing || existing.status !== "planned")) fail("ไม่พบรายการที่รอยืนยัน", 409);
      const entryId = existing?.entry_id ?? Number(payload.entryId);
      if (!Number.isSafeInteger(entryId) || entryId <= 0) fail("Invalid email ID");
      const entry = (await client.query("SELECT * FROM projectm_itune_entries WHERE id=$1 FOR UPDATE", [entryId])).rows[0];
      if (body.action !== "cancel" && (!entry || Number(entry.claimed_by_user_id) !== actor.id ||
        String(entry.active_claim_session_id) !== String(existing?.claim_session_id ?? payload.claimSessionId))) {
        fail("เมลนี้ไม่ได้อยู่ในรอบการจองของคุณแล้ว กรุณายกเลิกและเลือกใหม่", 409);
      }
      if (body.action !== "cancel") {
        const pending = (await client.query("SELECT EXISTS(SELECT 1 FROM projectm_itune_issue_log WHERE entry_id=$1 AND is_reject AND reject_confirmed_at IS NULL) AS pending", [entryId])).rows[0]?.pending;
        if (pending || entry.status === ITUNE_UNAVAILABLE_STATUS || (body.action === "plan" && Number(entry.amount) <= 0)) fail("เมลนี้ไม่พร้อมใช้งานแล้ว", 409);
      }
      if (body.action === "confirm" && entry.currency !== existing.currency) fail("สกุลเงินถูกเปลี่ยน กรุณายกเลิกและเลือกเมลใหม่", 409);
      if (body.action === "confirm" && entry.email !== existing.email) fail("อีเมลถูกเปลี่ยน กรุณายกเลิกและเลือกเมลใหม่", 409);
      if (Date.now() > deadline) fail("คำขอหมดเวลา กรุณาลองรายการเดิมอีกครั้ง", 503);
      if (body.action === "plan") {
        if (!text(entry.currency,64)) fail("กรุณากำหนดสกุลเงินให้เมลก่อน (ไม่เกิน 64 ตัวอักษร)");
        await client.query(`INSERT INTO projectm_itune_order_usage
          (id,order_id,line_id,entry_id,claim_session_id,user_id,external_user_id,email,currency,game_name,package_label)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [payload.id,orderId,lineId,entry.id,entry.active_claim_session_id,actor.id,body.actorId,entry.email,entry.currency,text(body.order.gameName,256),text(body.order.packageLabel,256)]);
      } else {
        await client.query("UPDATE projectm_itune_order_usage SET status=$2,used_amount=$3,finished_at=NOW(),cancel_reason=$4,cancelled_by_user_id=$5,cancelled_by_external_id=$6 WHERE id=$1",
          [payload.id, body.action === "confirm" ? "completed" : "cancelled", amount ?? null, body.action === "cancel" ? "ยกเลิกโดยผู้รับผิดชอบ Order" : null,
            body.action === "cancel" ? actor.id : null, body.action === "cancel" ? body.actorId : null]);
      }
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") fail("มีเมลเตรียมใช้อยู่แล้ว กรุณายกเลิกรายการเดิมก่อน", 409);
    throw err;
  } finally { client.release(); }
}
