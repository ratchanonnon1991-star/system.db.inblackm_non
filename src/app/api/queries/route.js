import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireSuperAdmin } from "@/server/auth";
import { findConnectionById } from "@/server/connections-repository";
import { insertQuery, listQueries } from "@/server/gamedb-repository";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer";
import { validateReadOnlySql } from "@/server/gamedb-query-runner";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const queries = await listQueries();
    return jsonOk({ queries });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดรายการ Query ได้");
  }
}

export async function POST(request) {
  try {
    const admin = await requireSuperAdmin(request);
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return jsonError("กรุณาตั้งชื่อ Query", 400);
    const sqlText = validateReadOnlySql(body.sqlText);

    let connectionId = null;
    if (body.connectionId) {
      const connection = await findConnectionById(body.connectionId);
      if (!connection) return jsonError("ไม่พบฐานข้อมูลที่เลือก", 404);
      connectionId = connection.id;
    }

    const query = await insertQuery({
      name,
      description: String(body.description || "").trim(),
      sqlText,
      layout: sanitizeLayout(body.layout),
      createdBy: admin.email,
      connectionId,
    });
    return jsonOk({ query }, 201);
  } catch (err) {
    return handleApiError(err, "ไม่สามารถสร้าง Query ได้");
  }
}
