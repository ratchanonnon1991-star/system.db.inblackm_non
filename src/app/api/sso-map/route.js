import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { listSsoMappings, upsertSsoMapping } from "@/server/gamedb-sso-map-repository";
import { findUserByUsername } from "@/server/users-repository";

export async function GET(request) {
  try {
    await requireSuperAdmin(request);
    const mappings = await listSsoMappings();
    return jsonOk({ mappings });
  } catch (err) {
    return handleApiError(err, "โหลดรายการเชื่อมบัญชี hiring ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const hiringEmail = String(body.hiringEmail || "").trim();
    const gamedbUsername = String(body.gamedbUsername || "").trim();
    if (!hiringEmail || !hiringEmail.includes("@")) {
      return jsonError("กรุณากรอกอีเมล hiring ให้ถูกต้อง", 400);
    }
    if (!gamedbUsername) {
      return jsonError("กรุณาเลือกบัญชี gamedb ที่จะเชื่อม", 400);
    }
    // The mapping only ever matters at the moment someone tries to use it --
    // checking now, while an admin is looking at the form, catches a typo'd
    // username immediately instead of at the next SSO login attempt.
    const user = await findUserByUsername(gamedbUsername);
    if (!user) return jsonError(`ไม่พบบัญชี gamedb ชื่อ "${gamedbUsername}"`, 404);

    const mapping = await upsertSsoMapping({ hiringEmail, gamedbUsername: user.username });
    return jsonOk({ mapping }, 201);
  } catch (err) {
    return handleApiError(err, "เชื่อมบัญชี hiring ไม่สำเร็จ");
  }
}
