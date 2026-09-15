import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { createSocialFolder, deleteSocialFolder } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    const user = await requireAdmin(request);
    const body = await request.json();
    return jsonOk(await createSocialFolder(user.id, body.name));
  } catch (error) { return handleApiError(error, "สร้างโฟลเดอร์ไม่สำเร็จ"); }
}

export async function DELETE(request) {
  try {
    const user = await requireAdmin(request);
    const id = request.nextUrl.searchParams.get("id");
    await deleteSocialFolder(user.id, id);
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "ลบโฟลเดอร์ไม่สำเร็จ"); }
}
