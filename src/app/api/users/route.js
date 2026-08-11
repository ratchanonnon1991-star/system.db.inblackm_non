import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import {
  findUserByUsername,
  insertUser,
  listUsers,
} from "@/server/users-repository";
import { findViewById } from "@/server/gamedb-views-repository";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 6;
const USER_ROLES = new Set(["admin", "staff", "user"]);

function parseDefaultViewId(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
}

export async function GET(request) {
  try {
    await requireSuperAdmin(request);
    const users = await listUsers();
    return jsonOk({ users });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดรายชื่อผู้ใช้ได้");
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = String(body.role || "staff");

    if (!USERNAME_PATTERN.test(username)) {
      return jsonError("username ต้องเป็น a-z, 0-9, _ . - ยาว 3-32 ตัว", 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return jsonError(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`, 400);
    }
    if (!USER_ROLES.has(role)) {
      return jsonError("ประเภทผู้ใช้ไม่ถูกต้อง", 400);
    }
    const defaultViewId = parseDefaultViewId(body.defaultViewId);
    if (defaultViewId === undefined) {
      return jsonError("Template หลักไม่ถูกต้อง", 400);
    }
    if (defaultViewId && !(await findViewById(defaultViewId))) {
      return jsonError("ไม่พบ Template หลักที่เลือก", 400);
    }
    if (await findUserByUsername(username)) {
      return jsonError("มี username นี้อยู่แล้ว", 409);
    }

    const user = await insertUser({
      username,
      displayName: String(body.displayName || "").trim() || username,
      password,
      role,
      defaultViewId: role === "user" ? defaultViewId : null,
      projectmRole: body.projectmRole ? "admin" : null,
    });
    return jsonOk({ user }, 201);
  } catch (err) {
    return handleApiError(err, "ไม่สามารถเพิ่มผู้ใช้ได้");
  }
}
