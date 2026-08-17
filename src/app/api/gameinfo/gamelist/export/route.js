import { handleApiError } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { toCsv } from "@/lib/gameinfo-csv";
import { GAMELIST_EXPORT_HEADERS, gameListRowsToCsvRows } from "@/lib/gameinfo-gamelist-csv";
import { listGameListRows } from "@/server/gameinfo-gamelist";

export async function GET(request) {
  try {
    await requireLayoutEditor(request);
    const rows = await listGameListRows();
    return new Response("﻿" + toCsv(GAMELIST_EXPORT_HEADERS, gameListRowsToCsvRows(rows)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="gameinfo_games_latest.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error, "ดาวน์โหลดรายการเกมไม่สำเร็จ");
  }
}
