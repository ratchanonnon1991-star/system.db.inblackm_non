import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { createStockAccount, listStockAccounts } from "@/server/stock-repository";

export async function GET(request) {
  try {
    await requireStockAccess(request);
    return jsonOk({ accounts: await listStockAccounts() });
  } catch (error) {
    return handleApiError(error, "โหลด stock ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireStockEditor(request);
    return jsonOk({ account: await createStockAccount(await request.json()) }, 201);
  } catch (error) {
    return handleApiError(error, "เพิ่มไอดี stock ไม่สำเร็จ");
  }
}
