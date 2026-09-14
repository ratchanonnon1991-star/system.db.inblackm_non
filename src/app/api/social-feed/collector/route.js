import { timingSafeEqual } from "node:crypto";
import { handleApiError, jsonOk } from "@/lib/http";
import { claimSocialSource, finishSocialSource, getCollectorRunning, heartbeatCollectorAccount, listCollectorSources, updateCollectorSourceStatus } from "@/server/social-feed-repository";

function authorized(request) {
  const configured = process.env.SOCIAL_FEED_INGEST_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return configured.length >= 24 && supplied.length === configured.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export async function GET(request) {
  try {
    if (!authorized(request)) { const error = new Error("ไม่มีสิทธิ์ใช้งาน collector"); error.status = 401; throw error; }
    const running = await getCollectorRunning();
    const publicMode = request.nextUrl.searchParams.get("mode") === "public";
    // เมื่อยังไม่กดเริ่มจากเว็บ เครื่องจะสแตนบาย (ไม่ได้รับกลุ่ม) แต่ยัง heartbeat ให้ขึ้นออนไลน์
    const sources = running || publicMode ? await listCollectorSources(request.nextUrl.searchParams.get("instance"), publicMode) : [];
    return jsonOk({ sources, running });
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
