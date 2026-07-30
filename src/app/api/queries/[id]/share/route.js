import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import {
  createShare,
  findShareForQuery,
  revokeShare,
} from "@/server/gamedb-shares-repository";

// Handing a table to people who have no account is a decision only an admin
// gets to make, so every verb here is behind requireSuperAdmin — including the
// read, since the token is the credential and must not leak to a plain user.
export async function GET(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    return jsonOk({ share: await findShareForQuery(id) });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถอ่านสถานะการแชร์ได้");
  }
}

export async function POST(request, { params }) {
  try {
    const admin = await requireSuperAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);
    return jsonOk({ share: await createShare(query.id, admin.username || "") });
  } catch (err) {
    return handleApiError(err, "สร้างลิงก์แชร์ไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    await revokeShare(id);
    return jsonOk({ share: null });
  } catch (err) {
    return handleApiError(err, "ยกเลิกลิงก์แชร์ไม่สำเร็จ");
  }
}
