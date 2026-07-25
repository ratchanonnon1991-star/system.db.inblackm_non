import { getPool } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function requireAdmin(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const data = verifySessionToken(token);
  if (!data?.sub) {
    throw createHttpError("กรุณาเข้าสู่ระบบผ่านหน้า Admin ของ INBLACKM ก่อน", 401);
  }

  const result = await getPool().query(
    `SELECT id, email, name, role, status FROM users WHERE id = $1`,
    [data.sub]
  );
  const user = result.rows[0];
  if (!user || (user.status || "").toLowerCase() !== "active") {
    throw createHttpError("บัญชีนี้ใช้งานไม่ได้", 401);
  }

  const role = (user.role || "").toLowerCase();
  if (role !== "admin" && role !== "staff") {
    throw createHttpError("บัญชีนี้ไม่มีสิทธิ์เข้าถึง GameDB", 403);
  }

  return { id: user.id, email: user.email, name: user.name, role };
}

export async function requireSuperAdmin(request) {
  const user = await requireAdmin(request);
  if (user.role !== "admin") {
    throw createHttpError("ต้องเป็น Super Admin เท่านั้น", 403);
  }
  return user;
}
