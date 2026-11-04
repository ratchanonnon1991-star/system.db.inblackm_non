import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess } from "@/server/auth";
import { ensurePurchaseOrderSchema } from "@/server/stock-purchase-order-repository";
import { listWalletEntries, listWallets } from "@/server/stock-wallet-repository";

// Wallets with balances per currency, and their entries (?walletId= narrows to one).
export async function GET(request) {
  try {
    await requireStockAccess(request);
    await ensurePurchaseOrderSchema();
    const walletId = request.nextUrl.searchParams.get("walletId");
    const [wallets, entries] = await Promise.all([listWallets(), listWalletEntries({ walletId })]);
    return jsonOk({ wallets, entries });
  } catch (error) {
    return handleApiError(error, "โหลดกระเป๋าเงินไม่สำเร็จ");
  }
}
