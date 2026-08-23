import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { gocashHistoryFeed } from "@/server/profit-aggregate";

// GoCash rows are read-only from the DB — only the sale/cost overlay is editable.
export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await gocashHistoryFeed();
    return jsonOk({ history, faceValue: 100 });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ GoCash ไม่สำเร็จ");
  }
}
