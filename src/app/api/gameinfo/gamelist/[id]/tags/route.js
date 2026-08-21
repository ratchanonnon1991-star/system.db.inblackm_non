import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { getGamelistTags, saveGamelistTags } from "@/server/gameinfo-gamelist-tags";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { id } = await params;
    return jsonOk({ tags: await getGamelistTags(Number(id)) });
  } catch (error) {
    return handleApiError(error, "โหลด tags เกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    return jsonOk({ tags: await saveGamelistTags(Number(id), body.tags) });
  } catch (error) {
    return handleApiError(error, "บันทึก tags เกมไม่สำเร็จ");
  }
}
