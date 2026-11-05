import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { decideWalletStatus } from "@/server/stock-wallet-repository";

// { decision: "approve" | "reject" } by someone other than who asked, or "cancel" by who asked.
export async function POST(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    return jsonOk({ entryId: await decideWalletStatus(id, String(body?.decision || ""), { id: user.id, name: user.displayName || user.username }) });
  } catch (error) {
    return handleApiError(error, "ยืนยันการเปลี่ยนสถานะไม่สำเร็จ");
  }
}
