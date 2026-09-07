import { handleApiError, jsonOk } from "@/lib/http";
import { listRazerAccountsForBot } from "@/server/profit-razer-bot";
import { requireRazerBotApiKey } from "@/server/razer-bot-auth";

export async function GET(request) {
  try {
    await requireRazerBotApiKey(request);
    const { searchParams } = new URL(request.url);
    const minGold = Number(searchParams.get("minGold") || searchParams.get("min_gold") || 0);
    const minSilver = Number(searchParams.get("minSilver") || searchParams.get("min_silver") || 0);
    const accounts = await listRazerAccountsForBot({
      zone: searchParams.get("zone") || undefined,
      status: searchParams.get("status") || undefined,
      minGold,
      minSilver,
      includeDisabled: searchParams.get("includeDisabled") === "1",
    });
    return jsonOk({
      accounts,
      count: accounts.length,
      hint: "GET นี้แค่อ่านรายการ (status ยังไม่เปลี่ยน) · หลังเลือกบัญชีต้อง POST /api/profit/razer/bot/accounts/:id/use หรือ POST /bot/pick / POST /bot/otp เพื่อมาร์ก IN_USE",
    });
  } catch (err) {
    return handleApiError(err, "โหลดบัญชี Razer สำหรับบอทไม่สำเร็จ");
  }
}
