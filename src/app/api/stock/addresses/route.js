import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { addCryptoAddress, listCryptoAddresses } from "@/server/stock-address-repository";

// The saved withdrawal addresses (anyone with Stock access reads them to copy).
export async function GET(request) {
  try {
    await requireStockAccess(request);
    return jsonOk({ addresses: await listCryptoAddresses() });
  } catch (error) {
    return handleApiError(error, "อ่าน address ไม่สำเร็จ");
  }
}

// { recipient, coin, chain, address, memo, note }: saved as waiting for a second person.
export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    const body = await request.json();
    return jsonOk({ address: await addCryptoAddress(body, { id: user.id, name: user.displayName || user.username }) });
  } catch (error) {
    return handleApiError(error, "บันทึก address ไม่สำเร็จ");
  }
}
