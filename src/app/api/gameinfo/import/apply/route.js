import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { parseCsv } from "@/lib/gameinfo-csv";
import { mergeCurrencies, PACK_HEADERS, parsePacks, validatePackRows } from "@/lib/gameinfo-import";
import { listGameListRows } from "@/server/gameinfo-gamelist";
import { importGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData, saveGameinfoModeData } from "@/server/gameinfo-mode-data";

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const form = await request.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") || "replace");
    if (!file || typeof file.text !== "function") return jsonError("ไม่พบไฟล์ที่อัปโหลด", 400);
    if (!String(file.name || "").toLowerCase().endsWith(".csv")) return jsonError("รองรับเฉพาะไฟล์ .csv", 400);
    if (mode !== "replace" && mode !== "add") return jsonError("โหมดนำเข้าไม่ถูกต้อง", 400);
    const { headers, rows } = parseCsv(await file.text());
    if (!rows.length) return jsonError("ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์", 400);
    if (!headers.includes("game_id")) return jsonError("ไม่พบคอลัมน์ game_id", 400);
    const unsupported = headers.filter(
      (header) => !PACK_HEADERS.includes(header) && header !== "amount_charged"
    );
    if (unsupported.length) return jsonError(`พบคอลัมน์ที่ระบบไม่รับ: ${unsupported.join(", ")}`, 400);
    const parsed = parsePacks(rows);
    const errors = [
      ...parsed.errors.filter((message) => !message.startsWith("พบคอลัมน์ amount_charged")),
      ...validatePackRows(rows),
    ];
    const existingIds = new Set((await listGameListRows()).map((game) => Number(game.id)));
    const missing = parsed.perGame.filter((game) => !existingIds.has(game.gameId)).map((game) => game.gameId);
    if (missing.length) errors.push(`ไม่พบ game_id ในระบบ: ${missing.join(", ")}`);
    if (!parsed.perGame.length) errors.push("ไม่พบข้อมูลเกมที่นำเข้าได้");
    if (errors.length) return jsonError(errors.join("\n"), 400);
    if (normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")) === "idpass") {
      let packCount = 0;
      for (const game of parsed.perGame) {
        const current = await getGameinfoModeData(game.gameId, "idpass");
        const currencies = mode === "add"
          ? mergeCurrencies(current.packs.currencies, game.currencies)
          : game.currencies;
        packCount += game.currencies.flatMap((currency) => currency.categories.flatMap((category) => category.packs)).length;
        await saveGameinfoModeData(game.gameId, "idpass", {
          ...current,
          packs: { ...current.packs, currencies },
        });
      }
      return jsonOk({ gameCount: parsed.perGame.length, packCount });
    }
    const result = await importGamelistPacks(parsed.perGame, mode, {
      id: user.id,
      name: user.displayName || user.username,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error, "นำเข้า packs ไม่สำเร็จ");
  }
}
