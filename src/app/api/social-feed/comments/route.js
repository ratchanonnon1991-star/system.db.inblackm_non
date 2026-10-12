import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { createSocialCommentJob } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ job: await createSocialCommentJob(await request.json()) });
  } catch (error) {
    return handleApiError(error, "สร้างงานคอมเมนต์ไม่สำเร็จ");
  }
}
