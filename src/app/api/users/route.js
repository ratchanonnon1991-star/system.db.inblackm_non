import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import {
  findUserByUsername,
  insertUser,
  listUsers,
} from "@/server/users-repository";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 6;

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
    const role = body.role === "admin" ? "admin" : "staff";

    if (!USERNAME_PATTERN.test(username)) {
      return jsonError("username ต้องเป็น a-z, 0-9, _ . - ยาว 3-32 ตัว", 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return jsonError(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`, 400);
    }
    if (await findUserByUsername(username)) {
      return jsonError("มี username นี้อยู่แล้ว", 409);
    }

    const user = await insertUser({
      username,
      displayName: String(body.displayName || "").trim() || username,
      password,
      role,
    });
    return jsonOk({ user }, 201);
  } catch (err) {
    return handleApiError(err, "ไม่สามารถเพิ่มผู้ใช้ได้");
  }
}
