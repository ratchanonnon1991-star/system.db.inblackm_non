import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { reviewWalletEntry } from "@/server/stock-wallet-repository";

// { decision: "approve" | "reject", note } on a correction awaiting approval, by someone other than who typed it.
export async function POST(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    const entryId = await reviewWalletEntry(id, String(body?.decision || ""), { id: user.id, name: user.displayName || user.username }, body?.note);
    return jsonOk({ entryId });
  } catch (error) {
    return handleApiError(error, "อนุมัติการปรับยอดไม่สำเร็จ");
  }
}
