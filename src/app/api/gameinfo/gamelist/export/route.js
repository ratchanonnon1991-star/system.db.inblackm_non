import { handleApiError } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { toCsv } from "@/lib/gameinfo-csv";
import { GAMELIST_EXPORT_HEADERS, gameListRowsToCsvRows } from "@/lib/gameinfo-gamelist-csv";
import { listGameListRows } from "@/server/gameinfo-gamelist";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { listGameinfoModeData } from "@/server/gameinfo-mode-data";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    const baseRows = await listGameListRows();
    const mode = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode"));
    const idpassByGame = mode === "idpass" ? await listGameinfoModeData(mode) : {};
    const rows = baseRows.map((row) => mode === "idpass" ? {
      ...row,
      ...(idpassByGame[row.id]?.fields || {}),
      link: idpassByGame[row.id]?.links?.[0]?.url || "",
    } : row);
    return new Response("﻿" + toCsv(GAMELIST_EXPORT_HEADERS, gameListRowsToCsvRows(rows)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gameinfo_games_${mode}_latest.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "ดาวน์โหลดรายการเกมไม่สำเร็จ");
  }
}
