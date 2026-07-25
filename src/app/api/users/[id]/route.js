import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import {
  countAdmins,
  deleteUser,
  findUserById,
  updateUser,
} from "@/server/users-repository";

const MIN_PASSWORD_LENGTH = 6;

export async function PATCH(request, { params }) {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await params;
    const target = await findUserById(id);
    if (!target) return jsonError("ไม่พบผู้ใช้นี้", 404);

    const body = await request.json();
    const fields = {};
    if (body.displayName !== undefined) {
      fields.displayName = String(body.displayName || "").trim() || target.username;
    }
    if (body.password) {
      const password = String(body.password);
      if (password.length < MIN_PASSWORD_LENGTH) {
        return jsonError(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`, 400);
      }
      fields.password = password;
    }
    if (body.role !== undefined) {
      const role = body.role === "admin" ? "admin" : "staff";
      if (target.role === "admin" && role !== "admin") {
        if (target.id === actor.id) {
          return jsonError("ลดสิทธิ์ตัวเองไม่ได้", 400);
        }
        if ((await countAdmins()) <= 1) {
          return jsonError("ต้องเหลือ admin อย่างน้อย 1 คน", 400);
        }
      }
      fields.role = role;
    }

    const user = await updateUser(id, fields);
    return jsonOk({ user });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถแก้ไขผู้ใช้ได้");
  }
}

export async function DELETE(request, { params }) {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await params;
    const target = await findUserById(id);
    if (!target) return jsonError("ไม่พบผู้ใช้นี้", 404);
    if (target.id === actor.id) {
      return jsonError("ลบบัญชีตัวเองไม่ได้", 400);
    }
    if (target.role === "admin" && (await countAdmins()) <= 1) {
      return jsonError("ต้องเหลือ admin อย่างน้อย 1 คน", 400);
    }

    await deleteUser(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถลบผู้ใช้ได้");
  }
}
