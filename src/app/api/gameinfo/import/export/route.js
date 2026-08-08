import { handleApiError, jsonError } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { toCsv } from "@/lib/gameinfo-csv";
import { PACK_HEADERS, gamesToPackRows } from "@/lib/gameinfo-import";
import { getGameListRow } from "@/server/gameinfo-gamelist";
import { getGamelistPacks } from "@/server/gameinfo-gamelist-packs";

// Export one game's packs as CSV (packs_game_N.csv). Same columns as the
// template, so an exported file re-imports cleanly (Export -> edit ->
// Import). The old "export every game at once" path (no ?gameId=) was only
// reachable from the removed multi-game games/game_packs admin import panel.
export async function GET(request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const gameIdRaw = searchParams.get("gameId");
    if (!gameIdRaw) return jsonError("ไม่พบ gameId", 400);

    const row = await getGameListRow(Number(gameIdRaw));
    if (!row) return jsonError("ไม่พบเกมนี้", 404);
    const packs = await getGamelistPacks(row.id);
    const games = [{ id: row.id, gameName: row.game, currencies: packs.currencies }];
    const filename = `packs_game_${row.id}.csv`;

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
