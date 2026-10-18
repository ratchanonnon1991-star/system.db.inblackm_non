import { requireProjectmAccess } from "@/server/auth";
import { handleApiError, jsonOk } from "@/lib/http";
import { balancePhotoImage, deleteBalancePhoto } from "@/server/itune-sheet-orders";

export async function GET(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { photoId } = await params;
    const response = jsonOk({ image: await balancePhotoImage(photoId, actor) }); response.headers.set("Cache-Control", "private, no-store"); return response;
  } catch (err) { return handleApiError(err, "โหลดรูปไม่สำเร็จ"); }
}

// Soft delete: the photo leaves the list but stays in the deletion history.
export async function DELETE(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { photoId } = await params;
    await deleteBalancePhoto(photoId, actor); return jsonOk({ ok: true });
  } catch (err) { return handleApiError(err, "ลบรูปไม่สำเร็จ"); }
}
