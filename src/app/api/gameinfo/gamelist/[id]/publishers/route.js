import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { getGamelistPublishers, saveGamelistPublishers } from "@/server/gameinfo-gamelist-tags";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { id } = await params;
    return jsonOk({ publishers: await getGamelistPublishers(Number(id)) });
  } catch (error) {
    return handleApiError(error, "โหลดค่ายเกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    return jsonOk({ publishers: await saveGamelistPublishers(Number(id), body.publishers) });
  } catch (error) {
    return handleApiError(error, "บันทึกค่ายเกมไม่สำเร็จ");
  }
}
