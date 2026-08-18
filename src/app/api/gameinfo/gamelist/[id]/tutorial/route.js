import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import {
  getGamelistTutorial,
  listAllGamelistTutorialCategories,
  saveGamelistTutorial,
} from "@/server/gameinfo-gamelist-tutorial";
import { recordEdit } from "@/server/gamedb-edit-log";
import { requestMeta } from "@/lib/request-meta";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData, updateGameinfoModeData } from "@/server/gameinfo-mode-data";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request); // any logged-in role — read-only view for "user"
    const { id } = await params;
    const mode = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode"));
    const [tutorial, categoryNames] = await Promise.all([
      mode === "idpass"
        ? getGameinfoModeData(Number(id), mode).then((data) => data.tutorial)
        : getGamelistTutorial(Number(id)),
      listAllGamelistTutorialCategories(),
    ]);
    return jsonOk({ tutorial, categoryNames });
  } catch (err) {
    return handleApiError(err, "โหลด tutorial ไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const admin = await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    if (normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")) === "idpass") {
      const data = await updateGameinfoModeData(Number(id), "idpass", (current) => ({
        ...current,
        tutorial: { categories: body.categories },
      }));
      return jsonOk({ tutorial: data.tutorial });
    }
    const before = await getGamelistTutorial(Number(id));
    const tutorial = await saveGamelistTutorial(Number(id), body.categories);
    await recordEdit({
      queryId: null,
      actor: admin.username || admin.displayName || "",
      table: "gamelist_tutorials",
      pkColumn: "game_id",
      pkValue: Number(id),
      column: "(tutorial)",
      oldValue: JSON.stringify(before).slice(0, 2000),
      newValue: JSON.stringify(tutorial).slice(0, 2000),
      ...requestMeta(request),
    });
    return jsonOk({ tutorial });
  } catch (err) {
    return handleApiError(err, "บันทึก tutorial ไม่สำเร็จ");
  }
}
