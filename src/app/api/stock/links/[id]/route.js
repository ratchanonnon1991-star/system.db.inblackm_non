import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { deleteStockAppLink, saveStockAppLink } from "@/server/stock-app-link-repository";

export async function PATCH(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    return jsonOk({ id: await saveStockAppLink(id, await request.json(), { name: user.displayName || user.username }) });
  } catch (error) {
    return handleApiError(error, "แก้ลิงก์ไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireStockEditor(request);
    const { id } = await params;
    return jsonOk({ id: await deleteStockAppLink(id) });
  } catch (error) {
    return handleApiError(error, "ลบลิงก์ไม่สำเร็จ");
  }
}
