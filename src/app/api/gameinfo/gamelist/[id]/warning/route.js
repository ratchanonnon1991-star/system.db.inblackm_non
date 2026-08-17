import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import {
  getGamelistWarning,
  listAllGamelistWarningCategories,
  saveGamelistWarning,
} from "@/server/gameinfo-gamelist-tutorial";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const [warning, categoryNames] = await Promise.all([
      getGamelistWarning(Number(id)),
      listAllGamelistWarningCategories(),
    ]);
    return jsonOk({ warning, categoryNames });
  } catch (error) {
    return handleApiError(error, "โหลดข้อควรระวังไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const warning = await saveGamelistWarning(Number(id), body.categories);
    return jsonOk({ warning });
  } catch (error) {
    return handleApiError(error, "บันทึกข้อควรระวังไม่สำเร็จ");
  }
}
