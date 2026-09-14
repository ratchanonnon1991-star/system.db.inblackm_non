import { timingSafeEqual } from "node:crypto";
import { handleApiError, jsonOk } from "@/lib/http";
import { claimSocialSource, finishSocialSource, heartbeatCollectorAccount, listCollectorSources, updateCollectorSourceStatus } from "@/server/social-feed-repository";

function authorized(request) {
  const configured = process.env.SOCIAL_FEED_INGEST_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return configured.length >= 24 && supplied.length === configured.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export async function GET(request) {
  try {
    if (!authorized(request)) { const error = new Error("ไม่มีสิทธิ์ใช้งาน collector"); error.status = 401; throw error; }
    return jsonOk({ sources: await listCollectorSources(request.nextUrl.searchParams.get("instance"), request.nextUrl.searchParams.get("mode") === "public") });
  } catch (error) { return handleApiError(error, "โหลดรายการกลุ่มไม่สำเร็จ"); }
}

export async function POST(request) {
  try {
    if (!authorized(request)) { const error = new Error("ไม่มีสิทธิ์ใช้งาน collector"); error.status = 401; throw error; }
    const body = await request.json();
    if (body.type === "claim") return jsonOk({ claimed: await claimSocialSource(body) });
    if (body.type === "heartbeat") return jsonOk({ account: await heartbeatCollectorAccount(body) });
    await updateCollectorSourceStatus(body);
    await finishSocialSource(body);
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "อัปเดตสถานะ session ไม่สำเร็จ"); }
}
