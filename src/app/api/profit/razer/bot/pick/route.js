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
      botName: body.botName || body.bot || body.by,
      orderId: body.orderId || body.order_id,
      note: body.note,
    });
    return jsonOk({
      ...result,
      hint: "บัญชีถูกมาร์ก IN_USE แล้ว · หลังใช้เสร็จเรียก POST .../release หรือ /report",
    });
  } catch (err) {
    return handleApiError(err, "เลือกบัญชี Razer สำหรับจ่ายไม่สำเร็จ");
  }
}
