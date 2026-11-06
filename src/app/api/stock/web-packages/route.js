import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { listTopupWebPackages } from "@/server/gameinfo-topup-web";

export const dynamic = "force-dynamic";

/** The main site's packages, for linking a stock pack to the ones it fills. Read only. */
export async function GET(request) {
  try {
    await requireStockEditor(request);
    const packages = await listTopupWebPackages();
    return jsonOk({ connected: packages !== null, packages: packages || [] });
  } catch (error) {
    return handleApiError(error, "โหลดรายการแพ็คจากเว็บหลักไม่สำเร็จ");
  }
}
