import { handleApiError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import {
  createGamelistPackLanguage,
  listGamelistPackLanguages,
} from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireLayoutEditor(request);
    return jsonOk({ languages: await listGamelistPackLanguages() });
  } catch (error) {
    return handleApiError(error, "โหลดรายการภาษาไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireLayoutEditor(request);
    const body = await request.json();
    const language = await createGamelistPackLanguage(body.name, user.id);
    return jsonOk({ language }, 201);
  } catch (error) {
    return handleApiError(error, "เพิ่มภาษาไม่สำเร็จ");
  }
}
