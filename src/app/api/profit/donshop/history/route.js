import { readProfitHistoryPage } from "@/server/profit-history-page";
import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { donshopHistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    const actor = await requireProfitAccess(request);
    if (new URL(request.url).searchParams.has("page")) {
      const result = await readProfitHistoryPage(request, actor, "donshop", donshopHistoryFeed);
      const response = jsonOk({ ...result });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const history = await donshopHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Donshop ไม่สำเร็จ");
  }
}
