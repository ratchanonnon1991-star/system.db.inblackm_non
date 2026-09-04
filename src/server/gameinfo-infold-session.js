import { parseInfoldFormData, fetchInfoldCatalog } from "@/server/gameinfo-infold-catalog";
import { encryptRussiaCheckSession } from "@/server/crypto";

const error = (message, status = 409) => Object.assign(new Error(message), { status });

export async function saveInfoldSession(pool, sourceId, fields, actor, { fetchCatalog = fetchInfoldCatalog, source: expectedSource } = {}) {
  const session = parseInfoldFormData(fields?.formData);
  let expiresAt = null;
  if (fields?.expiresAt) {
    expiresAt = new Date(fields.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw error("วันหมดอายุ session ต้องอยู่ในอนาคต", 400);
  }
  // A saved form is never considered verified until a fresh signed request
  // returns a complete, nonempty catalog. No DB writes precede this check.
  const catalog = await fetchCatalog(session, expectedSource ? { source: expectedSource } : undefined);
  const encrypted = encryptRussiaCheckSession(JSON.stringify(session));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const source = (await client.query(`SELECT * FROM gameinfo_russia_check_sources WHERE id=$1 FOR UPDATE`, [sourceId])).rows[0];
    if (!source || source.provider !== "infold") throw error("ไม่พบ Source Infold", 404);
    const busy = await client.query(`SELECT 1 FROM gameinfo_russia_check_run_sources rs JOIN gameinfo_russia_check_runs r ON r.id=rs.run_id WHERE rs.source_id=$1 AND r.status IN ('queued','running') LIMIT 1`, [sourceId]);
    if (busy.rowCount) throw error("รอให้รอบตรวจปัจจุบันเสร็จก่อนเปลี่ยน Login");
    if (source.catalog_scope_hash !== session.scopeHash) {
      const existing = await client.query(`SELECT 1 FROM gameinfo_russia_check_items WHERE source_id=$1 LIMIT 1`, [sourceId]);
      if (existing.rowCount) throw error("บัญชี/ตัวละคร/ภูมิภาคไม่ตรงกับชุดข้อมูลเดิม กรุณาใช้ชุดเดิมเพื่อไม่ให้เกิดรายการเข้าออกผิดพลาด");
    }
    await client.query(
      `INSERT INTO gameinfo_russia_check_source_credentials (source_id,session_enc,expires_at,updated_by,credential_kind,verified_at,invalidated_at)
       VALUES ($1,$2,$3,$4,'infold',NOW(),NULL)
       ON CONFLICT (source_id) DO UPDATE SET session_enc=EXCLUDED.session_enc,expires_at=EXCLUDED.expires_at,
         updated_by=EXCLUDED.updated_by,credential_kind='infold',verified_at=NOW(),invalidated_at=NULL,updated_at=NOW()`,
      [sourceId, encrypted, expiresAt, Number(actor?.id) || null]
    );
    await client.query(`UPDATE gameinfo_russia_check_sources SET enabled=true,catalog_scope_hash=$2,updated_at=NOW() WHERE id=$1`, [sourceId, session.scopeHash]);
    await client.query("COMMIT");
    return { sourceId, configured: true, authState: "verified", expiresAt, verifiedPackCount: catalog.length };
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  } finally { client.release(); }
}
