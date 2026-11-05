import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { listStockAppLinks, saveStockAppLink } from "@/server/stock-app-link-repository";

export async function GET(request) {
  try {
    await requireStockAccess(request);
    return jsonOk({ links: await listStockAppLinks() });
  } catch (error) {
    return handleApiError(error, "โหลดลิงก์แอปเติมไม่สำเร็จ");
  }
}

// { name, url, expiresOn: "YYYY-MM-DD", note }
export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    const id = await saveStockAppLink(null, await request.json(), { name: user.displayName || user.username });
    return jsonOk({ id }, 201);
  } catch (error) {
    return handleApiError(error, "เพิ่มลิงก์ไม่สำเร็จ");
  }
}
