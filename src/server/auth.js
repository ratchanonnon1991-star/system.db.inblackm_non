import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { findUserById } from "@/server/users-repository";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function requireAdmin(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const data = verifySessionToken(token);
  if (!data?.sub) {
    throw createHttpError("กรุณาเข้าสู่ระบบ", 401);
  }

  const user = await findUserById(data.sub);
  if (!user) {
    throw createHttpError("บัญชีนี้ใช้งานไม่ได้", 401);
  }
  return user;
}

export async function requireSuperAdmin(request) {
  const user = await requireAdmin(request);
  if (user.role !== "admin") {
    throw createHttpError("ต้องเป็น Admin เท่านั้น", 403);
  }
  return user;
}

export async function requireLayoutEditor(request) {
  const user = await requireAdmin(request);
  if (user.role === "user") {
    throw createHttpError("บัญชี User ใช้ layout จาก template เท่านั้น", 403);
  }
  return user;
}
