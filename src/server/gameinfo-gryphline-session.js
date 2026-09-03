import { verifyGryphlineSession } from "@/server/gameinfo-gryphline-catalog";
import { encryptRussiaCheckSession } from "@/server/crypto";

const fail = (message) => Object.assign(new Error(message), { status: 409 });
export async function saveGryphlineSession(pool, sourceId, fields, actor, { verify = verifyGryphlineSession } = {}) {
  const { session, catalog } = await verify(fields?.formData);
  const encrypted = encryptRussiaCheckSession(JSON.stringify(session));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const source = (await client.query(`SELECT * FROM gameinfo_russia_check_sources WHERE id=$1 FOR UPDATE`, [sourceId])).rows[0];
    if (source?.provider !== "gryphline") throw fail("ไม่พบ Source Endfield");
    const game = (await client.query(`SELECT game FROM game_list WHERE id=$1`, [source.game_id])).rows[0];
    if (String(game?.game || "").trim().toUpperCase() !== source.expected_game_name.trim().toUpperCase()) throw fail("Source ผูกกับเกมไม่ถูกต้อง");
    const busy = await client.query(`SELECT 1 FROM gameinfo_russia_check_run_sources rs JOIN gameinfo_russia_check_runs r ON r.id=rs.run_id WHERE rs.source_id=$1 AND r.status IN ('queued','running') LIMIT 1`, [sourceId]);
    if (busy.rowCount) throw fail("รอให้รอบตรวจปัจจุบันเสร็จก่อนเปลี่ยน Login");
    if (source.catalog_scope_hash !== session.scopeHash && (await client.query(`SELECT 1 FROM gameinfo_russia_check_items WHERE source_id=$1 LIMIT 1`, [sourceId])).rowCount) throw fail("บัญชี/เซิร์ฟเวอร์/ภูมิภาคไม่ตรงกับชุดข้อมูลเดิม กรุณาใช้ชุดเดิม");
    await client.query(`INSERT INTO gameinfo_russia_check_source_credentials (source_id,session_enc,expires_at,updated_by,credential_kind,verified_at,invalidated_at)
      VALUES ($1,$2,NULL,$3,'gryphline',NOW(),NULL)
      ON CONFLICT (source_id) DO UPDATE SET session_enc=EXCLUDED.session_enc,expires_at=NULL,updated_by=EXCLUDED.updated_by,
        credential_kind='gryphline',verified_at=NOW(),invalidated_at=NULL,updated_at=NOW()`, [sourceId, encrypted, Number(actor?.id) || null]);
    await client.query(`UPDATE gameinfo_russia_check_sources SET enabled=true,catalog_scope_hash=$2,updated_at=NOW() WHERE id=$1`, [sourceId, session.scopeHash]);
    await client.query("COMMIT");
    return { sourceId, configured: true, authState: "verified", expiresAt: null, verifiedPackCount: catalog.length };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
