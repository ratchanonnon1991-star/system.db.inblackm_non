import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { assignSocialSource, clearSimulatedSocialSourceNeedsJoin, createSocialSource, deleteSocialSources } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ source: await createSocialSource(await request.json()) }, 201);
  } catch (error) { return handleApiError(error, "เพิ่มกลุ่ม Facebook ไม่สำเร็จ"); }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ deleted: await deleteSocialSources(request.nextUrl.searchParams.get("id") || "") });
  } catch (error) { return handleApiError(error, "ลบกลุ่ม Facebook ไม่สำเร็จ"); }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    return jsonOk({ source: body.action === "clearSimulatedNeedsJoin"
        ? await clearSimulatedSocialSourceNeedsJoin(body.sourceId)
        : await assignSocialSource(body) });
  } catch (error) { return handleApiError(error, "อัปเดตกลุ่ม Facebook ไม่สำเร็จ"); }
}
