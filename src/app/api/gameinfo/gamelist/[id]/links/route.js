import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireGameinfoEditor } from "@/server/auth";
import { getGameListRow } from "@/server/gameinfo-gamelist";
import {
  getGamelistLinks,
  legacyGamelistLinks,
  saveGamelistLinks,
} from "@/server/gameinfo-gamelist-links";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData, updateGameinfoModeData } from "@/server/gameinfo-mode-data";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const gameId = Number(id);
    if (normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")) === "idpass") {
      const data = await getGameinfoModeData(gameId, "idpass");
      return jsonOk({ links: data.links });
    }
    const [stored, game] = await Promise.all([getGamelistLinks(gameId), getGameListRow(gameId)]);
    return jsonOk({ links: stored.exists ? stored.links : legacyGamelistLinks(game?.link) });
  } catch (error) {
    return handleApiError(error, "โหลดลิงก์เกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    if (normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")) === "idpass") {
      const data = await updateGameinfoModeData(Number(id), "idpass", (current) => ({
        ...current,
        links: body.links,
      }));
      return jsonOk({ links: data.links });
    }
    return jsonOk({ links: await saveGamelistLinks(Number(id), body.links) });
  } catch (error) {
    return handleApiError(error, "บันทึกลิงก์เกมไม่สำเร็จ");
  }
}
