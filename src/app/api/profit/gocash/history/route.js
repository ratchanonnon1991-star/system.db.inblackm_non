import { readProfitHistoryPage } from "@/server/profit-history-page";
import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { gocashHistoryFeed } from "@/server/profit-aggregate";

// GoCash rows are read-only from the DB — only the sale/cost overlay is editable.
export async function GET(request) {
  try {
    const actor = await requireProfitAccess(request);
    if (new URL(request.url).searchParams.has("page")) {
      const result = await readProfitHistoryPage(request, actor, "gocash", gocashHistoryFeed);
      const response = jsonOk({ ...result, faceValue: 100 });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const history = await gocashHistoryFeed();
    return jsonOk({ history, faceValue: 100 });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ GoCash ไม่สำเร็จ");
  }
}
