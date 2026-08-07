import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import { createGameinfoGame, listGameinfoGames } from "@/server/gameinfo-games";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const games = await listGameinfoGames();
    return jsonOk({ games });
  } catch (err) {
    return handleApiError(err, "โหลดรายการเกมไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const body = await request.json();
    const gameName = String(body.gameName || "").trim();
    if (!gameName) return jsonError("กรุณากรอกชื่อเกม", 400);
    const game = await createGameinfoGame({
      gameName,
      region: body.region,
      vpn: body.vpn,
      webTopup: body.webTopup,
      platform: body.platform,
      server: body.server,
      image: body.image,
    });
    return jsonOk({ game }, 201);
  } catch (err) {
    return handleApiError(err, "เพิ่มเกมไม่สำเร็จ");
  }
}
