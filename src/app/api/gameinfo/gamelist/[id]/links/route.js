import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import { getGameListRow } from "@/server/gameinfo-gamelist";
import {
  getGamelistLinks,
  legacyGamelistLinks,
  saveGamelistLinks,
} from "@/server/gameinfo-gamelist-links";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const gameId = Number(id);
    const [stored, game] = await Promise.all([getGamelistLinks(gameId), getGameListRow(gameId)]);
    return jsonOk({ links: stored.exists ? stored.links : legacyGamelistLinks(game?.link) });
  } catch (error) {
    return handleApiError(error, "โหลดลิงก์เกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    return jsonOk({ links: await saveGamelistLinks(Number(id), body.links) });
  } catch (error) {
    return handleApiError(error, "บันทึกลิงก์เกมไม่สำเร็จ");
  }
}
