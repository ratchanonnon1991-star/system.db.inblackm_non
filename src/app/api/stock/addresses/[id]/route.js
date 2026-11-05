import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { decideCryptoAddress } from "@/server/stock-address-repository";

// { action: "confirm" } by someone other than who added it, or { action: "retire", reason }.
export async function PATCH(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    return jsonOk({ address: await decideCryptoAddress(id, body?.action, { id: user.id, name: user.displayName || user.username }, body?.reason) });
  } catch (error) {
    return handleApiError(error, "บันทึกไม่สำเร็จ");
  }
}
