import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { parseCsv } from "@/lib/gameinfo-csv";
import { PACK_HEADERS, parsePacks, validatePackRows } from "@/lib/gameinfo-import";
import { listGameListRows } from "@/server/gameinfo-gamelist";
import { importGamelistPacks } from "@/server/gameinfo-gamelist-packs";

export async function PUT(request) {
  try {
    await requireLayoutEditor(request);
    const form = await request.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") || "replace");
    if (!file || typeof file.text !== "function") return jsonError("ไม่พบไฟล์ที่อัปโหลด", 400);
    if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
      return jsonError("รองรับเฉพาะไฟล์ .csv", 400);
    }
    if (mode !== "replace" && mode !== "add") return jsonError("โหมดนำเข้าไม่ถูกต้อง", 400);

    const { headers, rows } = parseCsv(await file.text());
    if (!rows.length) return jsonError("ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์", 400);
    if (!headers.includes("game_id")) return jsonError("ไม่พบคอลัมน์ game_id", 400);
    const unsupported = headers.filter((header) => !PACK_HEADERS.includes(header));
    if (unsupported.length) {
      return jsonError(`พบคอลัมน์ที่ระบบไม่รับ: ${unsupported.join(", ")}`, 400);
    }
    const parsed = parsePacks(rows);
    const errors = [...parsed.errors, ...validatePackRows(rows)];
    const existingIds = new Set((await listGameListRows()).map((game) => Number(game.id)));
    const missingIds = parsed.perGame.filter((game) => !existingIds.has(game.gameId)).map((game) => game.gameId);
    if (missingIds.length) errors.push(`ไม่พบ game_id ในระบบ: ${missingIds.join(", ")}`);
    if (!parsed.perGame.length) errors.push("ไม่พบข้อมูลเกมที่นำเข้าได้");
    if (errors.length) return jsonError(errors.join("\n"), 400);

    const result = await importGamelistPacks(parsed.perGame, mode);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "นำเข้า packs ไม่สำเร็จ");
  }
}
