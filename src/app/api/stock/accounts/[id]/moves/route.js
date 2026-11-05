import { NextResponse } from "next/server";
import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { listStockMoves, recordStockMove } from "@/server/stock-repository";
import { STOCK_MOVE_KINDS } from "@/lib/stock";

export async function GET(request, { params }) {
  try {
    await requireStockAccess(request);
    const { id } = await params;
    const kind = request.nextUrl.searchParams.get("kind");
    return jsonOk({ moves: await listStockMoves(id, { kind: STOCK_MOVE_KINDS.includes(kind) ? kind : null }) });
  } catch (error) {
    return handleApiError(error, "โหลดประวัติ stock ไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    const moveId = await recordStockMove(
      // orderPack (from รอตัด) teaches the pack; only the auto-cut scheduler makes awaiting cuts.
      { ...body, accountId: id, allowDuplicateQueue: body.allowDuplicateQueue === true,
        orderPack: typeof body.orderPack === "string" ? body.orderPack : "", awaiting: false },
      { id: user.id, name: user.displayName || user.username }
    );
    return jsonOk({ moveId }, 201);
  } catch (error) {
    // The form asks before saving a second cut under the same queue number.
    if (error.duplicateQueue) return NextResponse.json({ error: error.message, duplicateQueue: true }, { status: 409 });
    return handleApiError(error, "บันทึกรายการ stock ไม่สำเร็จ");
  }
}
