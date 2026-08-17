import { handleApiError, jsonError } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { toCsv } from "@/lib/gameinfo-csv";
import { PACK_HEADERS, gamesToPackRows } from "@/lib/gameinfo-import";
import { getGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";
import { getGamelistPacks } from "@/server/gameinfo-gamelist-packs";

// Export one game's packs as CSV (packs_game_N.csv). Same columns as the
// template, so an exported file re-imports cleanly (Export -> edit ->
// Import). The old "export every game at once" path (no ?gameId=) was only
// reachable from the removed multi-game games/game_packs admin import panel.
export async function GET(request) {
  try {
    await requireLayoutEditor(request);
    const { searchParams } = new URL(request.url);
    const gameIdRaw = searchParams.get("gameId");
    let games;
    let filename;
    if (gameIdRaw) {
      const row = await getGameListRow(Number(gameIdRaw));
      if (!row) return jsonError("ไม่พบเกมนี้", 404);
      const packs = await getGamelistPacks(row.id);
      games = [{ id: row.id, gameName: row.game, currencies: packs.currencies }];
      filename = `packs_game_${row.id}.csv`;
    } else {
      const rows = await listGameListRows();
      games = await Promise.all(
        rows.map(async (row) => {
          const packs = await getGamelistPacks(row.id);
          return { id: row.id, gameName: row.game, currencies: packs.currencies };
        })
      );
      filename = "packs_all_games.csv";
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
