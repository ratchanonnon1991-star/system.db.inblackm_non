import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { cloneGameinfoDataMode } from "@/server/gameinfo-mode-clone";

export async function POST(request, { params }) {
  try {
    const user = await requireLayoutEditor(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    const body = await request.json();
    return jsonOk(await cloneGameinfoDataMode({
      gameId,
      sourceMode: body.sourceMode,
      targetMode: body.targetMode,
      scope: body.scope === "packs" ? "packs" : "all",
      actor: { id: user.id, name: user.displayName || user.username },
    }));
  } catch (error) {
    return handleApiError(error, "clone ชุดข้อมูลไม่สำเร็จ");
  }
}
