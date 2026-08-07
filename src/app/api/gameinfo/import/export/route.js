import { handleApiError, jsonError } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { toCsv } from "@/lib/gameinfo-csv";
import { PACK_HEADERS, gamesToPackRows } from "@/lib/gameinfo-import";
import { getGameinfoGame, listGameinfoGames } from "@/server/gameinfo-games";

// Export packs as CSV. ?gameId=N exports one game (packs_game_N.csv), no param
// exports every game (gameinfo_packs.csv). Same columns as the template, so an
// exported file re-imports cleanly (Export -> edit -> Import).
export async function GET(request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const gameIdRaw = searchParams.get("gameId");

    let games;
    let filename;
    if (gameIdRaw) {
      const game = await getGameinfoGame(Number(gameIdRaw));
      if (!game) return jsonError("ไม่พบเกมนี้", 404);
      games = [game];
      filename = `packs_game_${game.id}.csv`;
    } else {
      games = await listGameinfoGames();
      filename = "gameinfo_packs.csv";
    }

    const csv = "﻿" + toCsv(PACK_HEADERS, gamesToPackRows(games));
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleApiError(err, "ส่งออกข้อมูลไม่สำเร็จ");
  }
}
