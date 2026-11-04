import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { ensurePurchaseOrderSchema } from "@/server/stock-purchase-order-repository";
import { recordWalletEntry } from "@/server/stock-wallet-repository";

// A deposit, move, exchange, payment or correction:
// { kind, fromWalletId, fromCurrency, toWalletId, toCurrency, amount, amountTo, fee, title, txid, occurredAt, note, status }.
export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    await ensurePurchaseOrderSchema();
    const entryId = await recordWalletEntry(await request.json(), { id: user.id, name: user.displayName || user.username });
    return jsonOk({ entryId }, 201);
  } catch (error) {
    return handleApiError(error, "บันทึกรายการกระเป๋าเงินไม่สำเร็จ");
  }
}
