import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setGocashCardGame } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { cardId } = await params;
    const body = await request.json();
    const gameId = await setGocashCardGame(cardId, body.gameId || null);
    return jsonOk({ gameId });
  } catch (err) {
    return handleApiError(err, "อัปเดตเกมของบัตรไม่สำเร็จ");
  }
}
