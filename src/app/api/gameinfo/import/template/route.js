import { handleApiError } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { toCsv } from "@/lib/gameinfo-csv";
import { PACK_HEADERS, PACK_SAMPLE } from "@/lib/gameinfo-import";

// Downloadable CSV template: the header row plus worked example rows so the
// user can see exactly what a pack row should look like. BOM-prefixed so Excel
// opens the Thai sample text correctly.
export async function GET(request) {
  try {
    await requireLayoutEditor(request);
    const csv = "﻿" + toCsv(PACK_HEADERS, PACK_SAMPLE);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="gameinfo_packs_template.csv"',
      },
    });
  } catch (err) {
    return handleApiError(err, "ดาวน์โหลด template ไม่สำเร็จ");
  }
}
