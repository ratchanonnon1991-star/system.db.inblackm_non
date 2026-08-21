import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { listGamelistTagImages, saveGamelistTagImage } from "@/server/gameinfo-gamelist-tags";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ images: await listGamelistTagImages() });
  } catch (error) {
    return handleApiError(error, "โหลดรูปหมวดหมู่ไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    await requireGameinfoEditor(request);
    const body = await request.json();
    return jsonOk(await saveGamelistTagImage(body.name, body.imageUrl));
  } catch (error) {
    return handleApiError(error, "บันทึกรูปหมวดหมู่ไม่สำเร็จ");
  }
}
