import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess } from "@/server/auth";
import { walletEntryTrail } from "@/server/stock-wallet-repository";

// Where one entry's money came from and where it went (first in, first out).
export async function GET(request, { params }) {
  try {
    await requireStockAccess(request);
    const { id } = await params;
    return jsonOk({ trail: await walletEntryTrail(id) });
  } catch (error) {
    return handleApiError(error, "อ่านที่มาที่ไปของรายการไม่สำเร็จ");
  }
}
