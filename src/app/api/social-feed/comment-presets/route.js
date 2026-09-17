import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { deleteSocialCommentPreset, listSocialCommentPresets, saveSocialCommentPreset } from "@/server/social-feed-repository";

export async function GET(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ categories: await listSocialCommentPresets() });
  } catch (error) { return handleApiError(error, "โหลดคลังข้อความไม่สำเร็จ"); }
}

export async function POST(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ item: await saveSocialCommentPreset(await request.json()) }, 201);
  } catch (error) { return handleApiError(error, "บันทึกคลังข้อความไม่สำเร็จ"); }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ item: await deleteSocialCommentPreset({ kind: request.nextUrl.searchParams.get("kind"), id: request.nextUrl.searchParams.get("id") }) });
  } catch (error) { return handleApiError(error, "ลบคลังข้อความไม่สำเร็จ"); }
}
