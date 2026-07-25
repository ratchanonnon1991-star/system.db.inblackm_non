import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireSuperAdmin } from "@/server/auth";
import {
  insertConnection,
  listConnections,
} from "@/server/connections-repository";

function validateConnectionBody(body, { requirePassword }) {
  const name = String(body.name || "").trim();
  const host = String(body.host || "").trim();
  const database = String(body.database || "").trim();
  const username = String(body.username || "").trim();
  const port = Number(body.port || 5432);
  if (!name || !host || !database || !username) {
    return { error: "กรุณากรอก ชื่อ, host, database และ username ให้ครบ" };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "พอร์ตไม่ถูกต้อง" };
  }
  const password = String(body.password || "");
  if (requirePassword && !password) {
    return { error: "กรุณากรอกรหัสผ่านฐานข้อมูล" };
  }
  return {
    value: { name, host, port, database, username, password, ssl: Boolean(body.ssl) },
  };
}

export async function GET(request) {
  try {
    await requireAdmin(request);
    const connections = await listConnections();
    return jsonOk({ connections });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดรายการฐานข้อมูลได้");
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const { error, value } = validateConnectionBody(body, { requirePassword: false });
    if (error) return jsonError(error, 400);
    const connection = await insertConnection(value);
    return jsonOk({ connection }, 201);
  } catch (err) {
    return handleApiError(err, "ไม่สามารถเพิ่มฐานข้อมูลได้");
  }
}
