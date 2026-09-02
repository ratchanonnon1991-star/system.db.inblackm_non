import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { syncRazerAccountById } from "@/server/profit-razer-sync";

export async function POST(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { id } = await params;
    const result = await syncRazerAccountById(id);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "ดึงยอด Razer ไม่สำเร็จ");
  }
}
