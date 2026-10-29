import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { updateStockAccount } from "@/server/stock-repository";

export async function PATCH(request, { params }) {
  try {
    await requireStockEditor(request);
    const { id } = await params;
    return jsonOk({ account: await updateStockAccount(id, await request.json()) });
  } catch (error) {
    return handleApiError(error, "แก้ไขไอดี stock ไม่สำเร็จ");
  }
}
