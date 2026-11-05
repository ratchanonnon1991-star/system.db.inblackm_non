import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { cancelAwaitingStockMove, confirmStockMove } from "@/server/stock-repository";
import { skipStockOrder } from "@/server/stock-pending-orders";

// A cut the auto-cut scheduler made, waiting for a person.

/** Confirm it. */
export async function PATCH(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    await confirmStockMove(id, { id: user.id, name: user.displayName || user.username });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error, "ยืนยันไม่สำเร็จ");
  }
}

/**
 * Cancel it: the units come back. ?skip=1 marks the order "ไม่ได้ใช้ stock" and
 * keeps the learned pack; without it the pack was wrong, so the learned pack is
 * forgotten and the order goes back to รอตัด for a person to cut the right one.
 */
export async function DELETE(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const skip = request.nextUrl.searchParams.get("skip") === "1";
    const move = await cancelAwaitingStockMove(id, { forget: !skip });
    if (skip && move.queue) {
      await skipStockOrder({ ref: move.queue, game: move.note, pack: move.orderPack }, { id: user.id, name: user.displayName || user.username });
    }
    return jsonOk({ ok: true, queue: move.queue });
  } catch (error) {
    return handleApiError(error, "ยกเลิกไม่สำเร็จ");
  }
}
