import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import {
  getGamelistTutorial,
  listAllGamelistTutorialCategories,
  saveGamelistTutorial,
} from "@/server/gameinfo-gamelist-tutorial";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request); // any logged-in role — read-only view for "user"
    const { id } = await params;
    const [tutorial, categoryNames] = await Promise.all([
      getGamelistTutorial(Number(id)),
      listAllGamelistTutorialCategories(),
    ]);
    return jsonOk({ tutorial, categoryNames });
  } catch (err) {
    return handleApiError(err, "โหลด tutorial ไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const tutorial = await saveGamelistTutorial(Number(id), body.categories);
    return jsonOk({ tutorial });
  } catch (err) {
    return handleApiError(err, "บันทึก tutorial ไม่สำเร็จ");
  }
}
