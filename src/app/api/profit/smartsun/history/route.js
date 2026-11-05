import { readProfitHistoryPage } from "@/server/profit-history-page";
import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { smartsunHistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    const actor = await requireProfitAccess(request);
    if (new URL(request.url).searchParams.has("page")) {
      const result = await readProfitHistoryPage(request, actor, "smartsun", smartsunHistoryFeed);
      const response = jsonOk({ ...result });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const history = await smartsunHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Smart-Sun ไม่สำเร็จ");
  }
}
