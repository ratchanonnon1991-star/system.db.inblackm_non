import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { createOrder } from "@/server/profit-repository";

export async function POST(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { cardId } = await params;
    if (cardId.startsWith("gocash:")) {
      return jsonError("บัตร GoCash เพิ่มออเดอร์เองไม่ได้ เป็นข้อมูลจริงจากบอท", 400);
    }
    const body = await request.json();
    const order = await createOrder({ cardId, ...body });
    return jsonOk({ order });
  } catch (err) {
    return handleApiError(err, "เพิ่มออเดอร์ไม่สำเร็จ");
  }
}
