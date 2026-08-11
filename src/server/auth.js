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

/**
 * Inline cell edit and add/remove rows ("the editable table" -- see
 * /api/queries/[id]/cell and /api/queries/[id]/row) used to be Admin-only.
 * A Staff account can now be granted one or both of these individually (see
 * canWriteData/canUpdateData on gamedb_user_preferences, set from
 * UsersModal) without becoming an Admin -- role "user" is excluded outright
 * regardless of what is stored, since its entire point is a read-only
 * template with no layout of its own to point an editable column at.
 */
export async function requireDataWriter(request) {
  const user = await requireAdmin(request);
  if (user.role === "admin") return user;
  if (user.role === "staff" && user.canWriteData) return user;
  throw createHttpError("บัญชีนี้ไม่มีสิทธิ์เพิ่ม/ลบแถวในตารางนี้", 403);
}

export async function requireDataUpdater(request) {
  const user = await requireAdmin(request);
  if (user.role === "admin") return user;
  if (user.role === "staff" && user.canUpdateData) return user;
  throw createHttpError("บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลในตารางนี้", 403);
}
