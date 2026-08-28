import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import {
  deleteGameinfoFormulaPreset,
  updateGameinfoFormulaPreset,
} from "@/server/gameinfo-gamelist-packs";

async function readPresetId(params) {
  const { id } = await params;
  const presetId = Number(id);
  return Number.isSafeInteger(presetId) && presetId > 0 ? presetId : null;
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const presetId = await readPresetId(params);
    if (!presetId) return jsonError("Formula Memory ID ไม่ถูกต้อง", 400);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("รูปแบบ Formula Memory ไม่ถูกต้อง", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("รูปแบบ Formula Memory ไม่ถูกต้อง", 400);
    }
    const preset = await updateGameinfoFormulaPreset(presetId, body, {
      id: user.id,
      name: user.displayName || user.username,
    });
    return jsonOk({ preset });
  } catch (error) {
    return handleApiError(error, "แก้ไข Formula Memory ไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    const presetId = await readPresetId(params);
    if (!presetId) return jsonError("Formula Memory ID ไม่ถูกต้อง", 400);
    const version = Number(request.nextUrl.searchParams.get("version"));
    return jsonOk({ deleted: await deleteGameinfoFormulaPreset(presetId, version) });
  } catch (error) {
    return handleApiError(error, "ลบ Formula Memory ไม่สำเร็จ");
  }
}
