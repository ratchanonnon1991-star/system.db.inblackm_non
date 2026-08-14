import { handleApiError } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { toCsv } from "@/lib/gameinfo-csv";
import {
  GAMELIST_EXPORT_HEADERS,
  gameListRowsToCsvRows,
} from "@/lib/gameinfo-gamelist-csv";
import { listGameListRows } from "@/server/gameinfo-gamelist";

export async function GET(request) {
  try {
    await requireLayoutEditor(request);
    const rows = await listGameListRows();
    const csv = "﻿" + toCsv(GAMELIST_EXPORT_HEADERS, gameListRowsToCsvRows(rows));
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="gameinfo_games_latest.csv"',
      },
    });
  } catch (err) {
    return handleApiError(err, "ดาวน์โหลดรายการเกมไม่สำเร็จ");
  }
}
