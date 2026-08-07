import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { importGameinfoPacks } from "@/server/gameinfo-games";

// Commit a multi-game pack import. Body: { perGame: [{ gameId, currencies }],
// mode: "replace" | "add" }. Games not found are skipped and reported back;
// existing computed columns are preserved by importGameinfoPacks.
export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const body = await request.json();
    const perGame = Array.isArray(body.perGame) ? body.perGame : [];
    const mode = body.mode === "add" ? "add" : "replace";
    if (!perGame.length) return jsonError("ไม่มีข้อมูลที่จะนำเข้า", 400);
    const result = await importGameinfoPacks(perGame, mode);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "นำเข้าข้อมูลไม่สำเร็จ");
  }
}
