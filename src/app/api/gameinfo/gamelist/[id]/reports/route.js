import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireGameinfoEditor } from "@/server/auth";
import {
  createGamelistReport,
  listGamelistReports,
  setGamelistReportStatus,
} from "@/server/gameinfo-gamelist-reports";

function actorName(user) {
  return user.username || user.displayName || String(user.id || "");
}

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    return jsonOk({ reports: await listGamelistReports(Number(id)) });
  } catch (error) {
    return handleApiError(error, "โหลด reports เกมไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireAdmin(request);
    const { id } = await params;
    const body = await request.json();
    const report = await createGamelistReport(Number(id), {
      source: user.role === "user" ? "topup" : "admin",
      message: body.message,
      actor: actorName(user),
    });
    return jsonOk({ report }, 201);
  } catch (error) {
    return handleApiError(error, "สร้าง report เกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    const report = await setGamelistReportStatus(Number(id), Number(body.reportId), body.status, actorName(user));
    return jsonOk({ report });
  } catch (error) {
    return handleApiError(error, "เปลี่ยนสถานะ report ไม่สำเร็จ");
  }
}
