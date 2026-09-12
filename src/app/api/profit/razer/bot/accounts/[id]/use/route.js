import { handleApiError, jsonOk } from "@/lib/http";
import { claimRazerAccountForBot } from "@/server/profit-razer-bot";
import { requireRazerBotApiKey } from "@/server/razer-bot-auth";

export async function POST(request, { params }) {
  try {
    await requireRazerBotApiKey(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await claimRazerAccountForBot(id, body);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "มาร์กบัญชี IN_USE ไม่สำเร็จ");
  }
}
