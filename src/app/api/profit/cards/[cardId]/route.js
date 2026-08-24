import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { deleteCard, updateCard } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { cardId } = await params;
    const body = await request.json();
    const card = await updateCard(cardId, body);
    if (!card) return jsonError("ไม่พบบัตรนี้", 404);
    return jsonOk({ card });
  } catch (err) {
    return handleApiError(err, "แก้ไขบัตรไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { cardId } = await params;
    await deleteCard(cardId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบบัตรไม่สำเร็จ");
  }
}
