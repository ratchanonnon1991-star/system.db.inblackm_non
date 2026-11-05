import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { updateStockItem } from "@/server/stock-repository";

export async function PATCH(request, { params }) {
  try {
    await requireStockEditor(request);
    const { id } = await params;
    return jsonOk({ itemId: await updateStockItem(id, await request.json()) });
  } catch (error) {
    return handleApiError(error, "แก้ไขแพ็คไม่สำเร็จ");
  }
}
