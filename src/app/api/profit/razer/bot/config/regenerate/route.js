import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { createRazerBotApiKey } from "@/server/profit-razer-bot-settings";

/** @deprecated use POST /config/keys with { name } */
export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim() || `Rotated ${new Date().toISOString().slice(0, 19)}`;
    const { secretKey, key, settings } = await createRazerBotApiKey({ name });
    return jsonOk({
      secretKey,
      key,
      botApi: settings,
      message: "คัดลอก Secret Key นี้ไปใช้กับบอท — จะไม่แสดงอีกครั้ง",
    });
  } catch (err) {
    return handleApiError(err, "สร้าง Secret Key ใหม่ไม่สำเร็จ");
  }
}
