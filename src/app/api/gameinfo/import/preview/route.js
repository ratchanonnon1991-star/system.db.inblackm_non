import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { parseCsv } from "@/lib/gameinfo-csv";
import { parsePacks, parsePacksForGame } from "@/lib/gameinfo-import";
import { getGameinfoGame, listGameinfoGames } from "@/server/gameinfo-games";

// Parse an uploaded CSV and return a preview — no DB writes. With ?gameId=N it
// parses every row onto that one game (single-game path, used by the pack
// editor). Without it, rows are grouped by their game_id column and each group
// is checked against the database so the UI can flag games that don't exist.
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

    const { rows } = parseCsv(await file.text());
    if (!rows.length) {
      return jsonError("ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์", 400);
    }

    // Single game: the file's game_id column is ignored, everything is this game.
    if (gameIdRaw) {
      const game = await getGameinfoGame(Number(gameIdRaw));
      if (!game) return jsonError("ไม่พบเกมนี้", 404);
      const { game: parsed, errors } = parsePacksForGame(rows, game.id, game.gameName);
      return jsonOk({ kind: "packs-single", game: parsed, errors });
    }

    // Multi game: group by game_id, then annotate each group with whether that
    // game actually exists so the client can skip-and-warn on commit.
    const { perGame, errors } = parsePacks(rows);
    const existing = await listGameinfoGames();
    const byId = new Map(existing.map((g) => [g.id, g]));
    const annotated = perGame.map((pg) => {
      const found = byId.get(pg.gameId);
      return { ...pg, exists: Boolean(found), gameName: found ? found.gameName : pg.gameName };
    });
    for (const pg of annotated) {
      if (!pg.exists) errors.push(`ไม่พบเกม game_id=${pg.gameId} ในระบบ — จะถูกข้าม`);
    }
    return jsonOk({ kind: "packs", perGame: annotated, errors });
  } catch (err) {
    return handleApiError(err, "อ่านไฟล์ไม่สำเร็จ");
  }
}
