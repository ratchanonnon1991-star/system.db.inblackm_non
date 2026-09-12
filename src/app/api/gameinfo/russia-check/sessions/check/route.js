import { jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { checkRussiaCheckSessions } from "@/server/gameinfo-russia-check";

export const maxDuration = 60;

export async function POST(request) {
  try {
    await requireGameinfoEditor(request);
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) throw Object.assign(new Error("ไม่อนุญาตคำขอจากเว็บไซต์อื่น"), { status: 403 });
    const body = await request.json();
    const result = jsonOk(await checkRussiaCheckSessions(body?.sourceId));
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch (error) {
    return jsonOk({ error: error.status < 500 || error.safeMessage ? error.message : "เช็ค Session ไม่สำเร็จ" }, error.status || 500);
  }
}
