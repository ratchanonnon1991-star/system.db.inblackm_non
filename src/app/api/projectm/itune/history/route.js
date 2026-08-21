import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { listItuneHistory } from "@/server/itune-entries-repository";

export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const { searchParams } = new URL(request.url);
    const result = await listItuneHistory({
      category: searchParams.get("category") || "all",
      query: searchParams.get("q") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 50,
    });
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "โหลดประวัติไม่สำเร็จ");
  }
}
