import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import { getGamelistImage, saveGamelistImage } from "@/server/gameinfo-gamelist-image";
import { recordEdit } from "@/server/gamedb-edit-log";
import { requestMeta } from "@/lib/request-meta";

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
    const admin = await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const before = await getGamelistImage(Number(id));
    const image = await saveGamelistImage(Number(id), body.imageUrl);
    if (before.imageUrl !== image.imageUrl) {
      await recordEdit({
        queryId: null,
        actor: admin.username || admin.displayName || "",
        table: "gamelist_images",
        pkColumn: "game_id",
        pkValue: Number(id),
        column: "(รูปเกม)",
        oldValue: before.imageUrl ? before.imageUrl.slice(0, 2000) : null,
        newValue: image.imageUrl ? image.imageUrl.slice(0, 2000) : null,
        ...requestMeta(request),
      });
    }
    return jsonOk(image);
  } catch (err) {
    return handleApiError(err, "บันทึกรูปภาพไม่สำเร็จ");
  }
}
