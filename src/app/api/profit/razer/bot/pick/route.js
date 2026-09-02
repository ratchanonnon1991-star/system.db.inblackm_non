import { handleApiError, jsonOk } from "@/lib/http";
import { pickRazerAccountForBot } from "@/server/profit-razer-bot";
import { requireRazerBotApiKey } from "@/server/razer-bot-auth";

export async function POST(request) {
  try {
    await requireRazerBotApiKey(request);
    const body = await request.json().catch(() => ({}));
    const result = await pickRazerAccountForBot({
      zone: body.zone,
      minGold: Number(body.minGold ?? body.min_gold ?? 0),
      email: body.email || undefined,
    });
    return jsonOk({ ...result, deprecated: "ใช้ GET /bot/accounts แล้วให้บอทเลือกเอง" });
  } catch (err) {
    return handleApiError(err, "เลือกบัญชี Razer สำหรับจ่ายไม่สำเร็จ");
  }
}
