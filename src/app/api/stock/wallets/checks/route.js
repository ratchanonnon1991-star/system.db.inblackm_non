import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { markWalletCheck } from "@/server/stock-wallet-repository";

// { walletId, period, currency, note }: a person has checked this month against the sheet.
export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    const body = await request.json();
    await markWalletCheck({ walletId: Number(body?.walletId), period: String(body?.period || ""), currency: String(body?.currency || "") },
      { id: user.id, name: user.displayName || user.username }, body?.note);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error, "บันทึกการตรวจไม่สำเร็จ");
  }
}
