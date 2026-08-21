import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { listGamelistPublisherImages, saveGamelistPublisherImage } from "@/server/gameinfo-gamelist-tags";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ images: await listGamelistPublisherImages() });
  } catch (error) {
    return handleApiError(error, "โหลดรูปค่ายเกมไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    await requireGameinfoEditor(request);
    const body = await request.json();
    return jsonOk(await saveGamelistPublisherImage(body.name, body.imageUrl));
  } catch (error) {
    return handleApiError(error, "บันทึกรูปค่ายเกมไม่สำเร็จ");
  }
}
