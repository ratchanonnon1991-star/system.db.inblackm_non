import { handleApiError, jsonOk } from "@/lib/http";
import { ingestSocialPosts } from "@/server/social-feed-repository";
import { timingSafeEqual } from "node:crypto";

function authorized(request) {
  const configured = process.env.SOCIAL_FEED_INGEST_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (configured.length < 24 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export async function POST(request) {
  try {
    if (!authorized(request)) {
      const error = new Error("ไม่มีสิทธิ์ส่งข้อมูลเข้า Social Feed"); error.status = 401; throw error;
    }
    const body = await request.json();
    return jsonOk(await ingestSocialPosts(body.posts));
  } catch (error) { return handleApiError(error, "นำเข้า Social Feed ไม่สำเร็จ"); }
}
