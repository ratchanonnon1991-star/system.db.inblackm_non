import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import {
  listGamelistPackViewPresets,
  saveGamelistPackViewPreset,
} from "@/server/gameinfo-gamelist-packs";

function readSurface(request) {
  const surface = new URL(request.url).searchParams.get("surface");
  return surface === "edit" || surface === "view" ? surface : null;
}

async function readGameId(params) {
  const { id } = await params;
  const gameId = Number(id);
  return Number.isInteger(gameId) && gameId > 0 ? gameId : null;
}

// A read-only GameInfo Topup still owns their own visual preference.
export async function GET(request, { params }) {
  try {
    const user = await requireGameinfoAccess(request);
    const gameId = await readGameId(params);
    if (!gameId) return jsonError("gameId ไม่ถูกต้อง", 400);
    const presets = await listGamelistPackViewPresets({ gameId, userId: user.id });
    return jsonOk({ presets });
  } catch (err) {
    return handleApiError(err, "โหลด preset การแสดงคอลัมน์ไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoAccess(request);
    const gameId = await readGameId(params);
    const surface = readSurface(request);
    if (!gameId) return jsonError("gameId ไม่ถูกต้อง", 400);
    if (!surface) return jsonError("surface ต้องเป็น edit หรือ view", 400);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("รูปแบบข้อมูล preset ไม่ถูกต้อง", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("รูปแบบข้อมูล preset ไม่ถูกต้อง", 400);
    }
    const preset = await saveGamelistPackViewPreset({
      gameId,
      userId: user.id,
      surface,
      presetId: body.presetId,
      name: body.name,
      layout: body.layout,
    });
    return jsonOk({ preset }, body.presetId == null || body.presetId === "" ? 201 : 200);
  } catch (err) {
    return handleApiError(err, "บันทึก preset การแสดงคอลัมน์ไม่สำเร็จ");
  }
}
