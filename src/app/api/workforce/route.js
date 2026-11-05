import { requireAdmin } from "@/server/auth";
import { hasPermission } from "@/lib/permissions";
import { jsonOk } from "@/lib/http";
import { loadWorkforceReport } from "@/server/workforce-service";

export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    if (user.role !== "admin" && !hasPermission(user, "workforce.access")) return Response.json({ error: "ไม่มีสิทธิ์ดูแผนกำลังคน" }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const report = await loadWorkforceReport({ date: params.get("date"), channel: params.get("channel") });
    const response = jsonOk({ report });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[workforce] report", error.code || error.status || "internal");
    return Response.json({ error: error.status ? error.message : "โหลดข้อมูลไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่" }, { status: error.status || 500 });
  }
}
