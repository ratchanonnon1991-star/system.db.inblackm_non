import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { setStockWebSync } from "@/server/stock-repository";

/** The main switch for the link to the main site. */
export async function PUT(request) {
  try {
    const user = await requireStockEditor(request);
    const body = await request.json();
    if (typeof body?.enabled !== "boolean") return handleApiError(Object.assign(new Error("ค่าไม่ถูกต้อง"), { status: 400 }), "ค่าไม่ถูกต้อง");
    return jsonOk({ enabled: await setStockWebSync(body.enabled, user.displayName || user.username) });
  } catch (error) {
    return handleApiError(error, "บันทึกการเชื่อมเว็บหลักไม่สำเร็จ");
  }
}
