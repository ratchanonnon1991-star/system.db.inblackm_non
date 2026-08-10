import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import { getGamelistImage, saveGamelistImage } from "@/server/gameinfo-gamelist-image";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request); // any logged-in role — read-only for "user"
    const { id } = await params;
    const image = await getGamelistImage(Number(id));
    return jsonOk(image);
  } catch (err) {
    return handleApiError(err, "โหลดรูปภาพไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const image = await saveGamelistImage(Number(id), body.imageUrl);
    return jsonOk(image);
  } catch (err) {
    return handleApiError(err, "บันทึกรูปภาพไม่สำเร็จ");
  }
}
