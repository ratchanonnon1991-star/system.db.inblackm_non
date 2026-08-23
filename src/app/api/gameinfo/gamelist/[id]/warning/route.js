import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  getGamelistWarning,
  listAllGamelistWarningCategories,
  saveGamelistWarning,
} from "@/server/gameinfo-gamelist-tutorial";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData, updateGameinfoModeData } from "@/server/gameinfo-mode-data";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { id } = await params;
    const mode = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode"));
    const [warning, categoryNames] = await Promise.all([
      mode === "idpass"
        ? getGameinfoModeData(Number(id), mode).then((data) => data.warning)
        : getGamelistWarning(Number(id)),
      listAllGamelistWarningCategories(),
    ]);
    return jsonOk({ warning, categoryNames });
  } catch (error) {
    return handleApiError(error, "โหลดข้อควรระวังไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    if (normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")) === "idpass") {
      const data = await updateGameinfoModeData(Number(id), "idpass", (current) => ({
        ...current,
        warning: {
          categories: body.categories,
          autoOpen: body.autoOpen === undefined ? true : Boolean(body.autoOpen),
          revision: new Date().toISOString(),
        },
      }), { area: "warning", actor: auditActor(user) });
      return jsonOk({ warning: data.warning });
    }
    const warning = await saveGamelistWarning(Number(id), body.categories, null, auditActor(user), { autoOpen: body.autoOpen });
    return jsonOk({ warning });
  } catch (error) {
    return handleApiError(error, "บันทึกข้อควรระวังไม่สำเร็จ");
  }
}
