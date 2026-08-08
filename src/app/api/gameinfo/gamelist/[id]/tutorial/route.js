import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import { getGamelistTutorial, saveGamelistTutorial } from "@/server/gameinfo-gamelist-tutorial";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request); // any logged-in role — read-only view for "user"
    const { id } = await params;
    const tutorial = await getGamelistTutorial(Number(id));
    return jsonOk({ tutorial });
  } catch (err) {
    return handleApiError(err, "โหลด tutorial ไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const tutorial = await saveGamelistTutorial(Number(id), body.steps);
    return jsonOk({ tutorial });
  } catch (err) {
    return handleApiError(err, "บันทึก tutorial ไม่สำเร็จ");
  }
}
