import { handleApiError, jsonOk } from "@/lib/http";
import { listRazerAccountsForBot } from "@/server/profit-razer-bot";
import { requireRazerBotApiKey } from "@/server/razer-bot-auth";

export async function GET(request) {
  try {
    await requireRazerBotApiKey(request);
    const { searchParams } = new URL(request.url);
    const minGold = Number(searchParams.get("minGold") || searchParams.get("min_gold") || 0);
    const minSilver = Number(searchParams.get("minSilver") || searchParams.get("min_silver") || 0);
    const withLiveOtp =
      searchParams.get("withLiveOtp") === "1"
      || searchParams.get("with_otp") === "1"
      || searchParams.get("includeOtp") === "1";
    const accounts = await listRazerAccountsForBot({
      zone: searchParams.get("zone") || undefined,
      status: searchParams.get("status") || undefined,
      minGold,
      minSilver,
      includeDisabled: searchParams.get("includeDisabled") === "1",
      withLiveOtp,
    });
    return jsonOk({
      accounts,
      count: accounts.length,
      withLiveOtp,
      hint: withLiveOtp
        ? "withLiveOtp=1 จะยิง OTP ทุกบัญชี — ช้าเมื่อเมลเยอะ ใช้เฉพาะตอนจำเป็น"
        : "GET นี้แค่อ่านรายการ + OTP จาก 2FA ใน DB (ไม่ยิง api-system ทีละเมล) · หลังเลือกบัญชีต้อง POST /bot/pick หรือ /accounts/:id/use หรือ GET /bot/otp?email=...",
    });
  } catch (err) {
    return handleApiError(err, "โหลดบัญชี Razer สำหรับบอทไม่สำเร็จ");
  }
}
