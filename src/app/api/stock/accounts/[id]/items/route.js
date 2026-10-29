import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { addStockItem } from "@/server/stock-repository";

export async function POST(request, { params }) {
  try {
    await requireStockEditor(request);
    const { id } = await params;
    return jsonOk({ itemId: await addStockItem(id, await request.json()) }, 201);
  } catch (error) {
    return handleApiError(error, "เพิ่มแพ็คไม่สำเร็จ");
  }
}
