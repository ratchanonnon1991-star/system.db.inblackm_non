import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { revokeRazerBotApiKey } from "@/server/profit-razer-bot-settings";

export async function DELETE(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { id } = await params;
    const settings = await revokeRazerBotApiKey(id);
    return jsonOk({ botApi: settings });
  } catch (err) {
    return handleApiError(err, "ยกเลิก Secret Key ไม่สำเร็จ");
  }
}
