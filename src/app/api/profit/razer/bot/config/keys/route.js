import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { createRazerBotApiKey } from "@/server/profit-razer-bot-settings";

export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json().catch(() => ({}));
    const { secretKey, key, settings } = await createRazerBotApiKey({ name: body.name });
    return jsonOk({
      secretKey,
      key,
      botApi: settings,
      message: "คัดลอก Secret Key ไปใช้กับบอท — จะไม่แสดงอีกครั้ง",
    });
  } catch (err) {
    return handleApiError(err, "สร้าง Secret Key ไม่สำเร็จ");
  }
}
