import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { parseCsv } from "@/lib/gameinfo-csv";
import { parsePacksForGame } from "@/lib/gameinfo-import";
import { getGameListRow } from "@/server/gameinfo-gamelist";

// Parse an uploaded CSV and return a preview — no DB writes. The file's own
// game_id column is ignored; every row is treated as ?gameId='s game_list
// row (used by the per-game pack editor — the only consumer left since the
// old multi-game games/game_packs admin import was removed).
export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const { searchParams } = new URL(request.url);
    const gameIdRaw = searchParams.get("gameId");
    if (!gameIdRaw) return jsonError("ไม่พบ gameId", 400);

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.text !== "function") {
      return jsonError("ไม่พบไฟล์ที่อัปโหลด", 400);
    }
    const name = String(file.name || "").toLowerCase();
    if (!name.endsWith(".csv")) {
      return jsonError("รองรับเฉพาะไฟล์ .csv", 400);
    }

    const { rows } = parseCsv(await file.text());
    if (!rows.length) {
      return jsonError("ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์", 400);
    }

    const row = await getGameListRow(Number(gameIdRaw));
    if (!row) return jsonError("ไม่พบเกมนี้", 404);
    const { game: parsed, errors } = parsePacksForGame(rows, row.id, row.game);
    return jsonOk({ kind: "packs-single", game: parsed, errors });
  } catch (err) {
    return handleApiError(err, "อ่านไฟล์ไม่สำเร็จ");
  }
}
