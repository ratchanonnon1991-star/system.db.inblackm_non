import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { listStockPackNames } from "@/server/stock-games";

// The GameInfo pack names of one game, for typing new packs in the order form.
export async function GET(request, { params }) {
  try {
    await requireStockEditor(request);
    const { id } = await params;
    const mode = request.nextUrl.searchParams.get("mode") === "idpass" ? "idpass" : "uid";
    return jsonOk({ packs: await listStockPackNames(Number(id) || null, mode) });
  } catch (error) {
    return handleApiError(error, "โหลดแพ็คของเกมไม่สำเร็จ");
  }
}
