import { readProfitHistoryPage } from "@/server/profit-history-page";
import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { u9HistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    const actor = await requireProfitAccess(request);
    if (new URL(request.url).searchParams.has("page")) {
      const result = await readProfitHistoryPage(request, actor, "u9", u9HistoryFeed);
      const response = jsonOk({ ...result });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const history = await u9HistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ U9 ไม่สำเร็จ");
  }
}
