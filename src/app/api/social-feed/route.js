import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { deleteAllSocialPosts, getSocialFeedState } from "@/server/social-feed-repository";

export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    const params = request.nextUrl.searchParams;
    return jsonOk(await getSocialFeedState(user.id, {
      categoryId: params.get("category") || "",
      folderId: params.get("folder") || "",
      saved: params.get("saved") || "",
      q: params.get("q") || "",
      dateFrom: params.get("dateFrom") || "",
      dateTo: params.get("dateTo") || "",
      page: params.get("page") || "1",
      pageSize: params.get("pageSize") || "20",
    }));
  } catch (error) {
    return handleApiError(error, "โหลด Social Feed ไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ deleted: await deleteAllSocialPosts() });
  } catch (error) {
    return handleApiError(error, "ลบโพสต์ Social Feed ไม่สำเร็จ");
  }
}
