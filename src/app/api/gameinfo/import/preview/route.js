import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { parseCsv } from "@/lib/gameinfo-csv";
import { PACK_HEADERS, parsePacks, parsePacksForGame, validatePackRows } from "@/lib/gameinfo-import";
import { getGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";

// Parse an uploaded CSV and return a preview — no DB writes. With ?gameId,
// every row is treated as that one game (the pack editor flow). Without it,
// rows are grouped by game_id for the list page's all-games import flow.
export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const { searchParams } = new URL(request.url);
    const gameIdRaw = searchParams.get("gameId");
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.text !== "function") {
      return jsonError("ไม่พบไฟล์ที่อัปโหลด", 400);
    }
    const name = String(file.name || "").toLowerCase();
    if (!name.endsWith(".csv")) {
      return jsonError("รองรับเฉพาะไฟล์ .csv", 400);
    }

    const { headers, rows } = parseCsv(await file.text());
    if (!rows.length) {
      return jsonError("ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์", 400);
    }
    const unsupported = headers.filter((header) => !PACK_HEADERS.includes(header));
    if (unsupported.length) {
      return jsonError(`พบคอลัมน์ที่ระบบไม่รับ: ${unsupported.join(", ")}`, 400);
    }

    if (gameIdRaw) {
      const row = await getGameListRow(Number(gameIdRaw));
      if (!row) return jsonError("ไม่พบเกมนี้", 404);
      const { game: parsed, errors } = parsePacksForGame(rows, row.id, row.game);
      return jsonOk({ kind: "packs-single", game: parsed, errors });
    }

    if (!headers.includes("game_id")) return jsonError("ไม่พบคอลัมน์ game_id", 400);

    const parsed = parsePacks(rows);
    const existing = await listGameListRows();
    const existingById = new Map(existing.map((game) => [Number(game.id), game]));
    const missingIds = parsed.perGame
      .filter((game) => !existingById.has(game.gameId))
      .map((game) => game.gameId);
    const errors = [...parsed.errors, ...validatePackRows(rows)];
    if (missingIds.length) errors.push(`ไม่พบ game_id ในระบบ: ${missingIds.join(", ")}`);
    return jsonOk({
      kind: "packs-bulk",
      games: parsed.perGame.map((game) => ({
        ...game,
        currentGameName: existingById.get(game.gameId)?.game || "",
      })),
      errors,
      warnings: [],
    });
  } catch (err) {
    return handleApiError(err, "อ่านไฟล์ไม่สำเร็จ");
  }
}
