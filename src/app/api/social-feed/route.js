import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { getSocialFeedState } from "@/server/social-feed-repository";

export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    const params = request.nextUrl.searchParams;
    return jsonOk(await getSocialFeedState(user.id, {
      categoryId: params.get("category") || "",
      tagId: params.get("tag") || "",
      saved: params.get("saved") || "",
      q: params.get("q") || "",
    }));
  } catch (error) {
    return handleApiError(error, "โหลด Social Feed ไม่สำเร็จ");
  }
}
