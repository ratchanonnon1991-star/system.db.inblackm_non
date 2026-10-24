import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { listTopupWebGames } from "@/server/gameinfo-topup-web";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    const games = await listTopupWebGames();
    return jsonOk({ connected: games !== null, games: games || [] });
  } catch (error) {
    return handleApiError(error, "โหลดรายชื่อเกมบนเว็บไม่สำเร็จ");
  }
}
