import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { regenerateRazerBotApiKey } from "@/server/profit-razer-bot-settings";

export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const { secretKey, settings } = await regenerateRazerBotApiKey();
    return jsonOk({
      secretKey,
      botApi: settings,
      message: "คัดลอก Secret Key นี้ไปใช้กับบอท — จะไม่แสดงอีกครั้ง",
    });
  } catch (err) {
    return handleApiError(err, "สร้าง Secret Key ใหม่ไม่สำเร็จ");
  }
}
