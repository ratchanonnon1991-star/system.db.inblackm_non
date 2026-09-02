import { handleApiError, jsonOk } from "@/lib/http";
import { getRazerOtpForBot, claimRazerAccountByEmailForBot } from "@/server/profit-razer-bot";
import { requireRazerBotApiKey } from "@/server/razer-bot-auth";

export async function GET(request) {
  try {
    await requireRazerBotApiKey(request);
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || undefined;
    const id = searchParams.get("id") || undefined;
    const otp = await getRazerOtpForBot({ id, email });
    return jsonOk({ otp });
  } catch (err) {
    return handleApiError(err, "โหลด OTP ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireRazerBotApiKey(request);
    const body = await request.json().catch(() => ({}));
    const email = body.email;
    if (!email) throw Object.assign(new Error("ต้องระบุ email"), { status: 400 });
    const result = await claimRazerAccountByEmailForBot(email, body);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "ใช้บัญชี Razer ไม่สำเร็จ");
  }
}
