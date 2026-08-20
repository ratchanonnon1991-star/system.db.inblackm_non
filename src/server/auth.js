import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { findUserById } from "@/server/users-repository";
import { findViewById, roleCanWriteView, viewContainsQuery } from "@/server/gamedb-views-repository";

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
 * UsersModal) without becoming an Admin. Role "user" only ever writes
 * through a template that explicitly opts in (view.allowUserEdit) -- there
 * is no account-level flag for "user" the way there is for Staff, since a
 * "user" account has no layout of its own to point an editable column at
 * outside a template.
 *
 * `ctx.viewId`, when given, additionally has to actually be a template that
 * displays `ctx.queryId` (see viewContainsQuery) -- otherwise a template
 * that grants writes on its own panels would just as well grant them on any
 * query id a caller cared to name. For Staff, a view found this way can only
 * ever narrow the account-level grant further (an admin turning
 * allowStaffEdit off for one template), never substitute for it; outside any
 * template (no viewId, e.g. plain /systemdb) the account-level grant alone
 * decides, exactly as before templates had their own toggle for this.
 */
async function requireDataAccess(request, accountFlag, deniedMessage, { queryId, viewId } = {}) {
  const user = await requireAdmin(request);
  if (user.role === "admin") return user;

  let view = null;
  if (viewId) {
    const candidate = await findViewById(viewId);
    if (candidate && viewContainsQuery(candidate, queryId)) view = candidate;
  }

  if (user.role === "staff" && user[accountFlag] && (!view || roleCanWriteView(view, "staff"))) {
    return user;
  }
  if (user.role === "user" && view && roleCanWriteView(view, "user")) {
    return user;
  }
  throw createHttpError(deniedMessage, 403);
}

export async function requireDataWriter(request, ctx) {
  return requireDataAccess(request, "canWriteData", "บัญชีนี้ไม่มีสิทธิ์เพิ่ม/ลบแถวในตารางนี้", ctx);
}

export async function requireDataUpdater(request, ctx) {
  return requireDataAccess(request, "canUpdateData", "บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลในตารางนี้", ctx);
}

export function hasProjectmAccess(user) {
  return user?.projectmRole === "admin" || user?.projectmRole === "topup";
}

export async function requireProjectmAccess(request) {
  const user = await requireAdmin(request);
  if (!hasProjectmAccess(user)) {
    throw createHttpError("บัญชีนี้ไม่มีสิทธิ์เข้า Projectm", 403);
  }
  return user;
}

export async function requireProjectmAdmin(request) {
  const user = await requireProjectmAccess(request);
  if (user.projectmRole !== "admin") {
    throw createHttpError("ต้องมีสิทธิ์ Admin ระบบ Projectm เท่านั้น", 403);
  }
  return user;
}
