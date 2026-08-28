import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import {
  createGameinfoFormulaPreset,
  listGameinfoFormulaPresets,
} from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    return jsonOk({ presets: await listGameinfoFormulaPresets() });
  } catch (error) {
    return handleApiError(error, "โหลด Formula Memory ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("รูปแบบ Formula Memory ไม่ถูกต้อง", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("รูปแบบ Formula Memory ไม่ถูกต้อง", 400);
    }
    const preset = await createGameinfoFormulaPreset(body, {
      id: user.id,
      name: user.displayName || user.username,
    });
    return jsonOk({ preset }, 201);
  } catch (error) {
    return handleApiError(error, "บันทึก Formula Memory ไม่สำเร็จ");
  }
}
