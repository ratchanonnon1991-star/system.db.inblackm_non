import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import {
  getRazerBotSettings,
  regenerateRazerBotApiKey,
  setRazerBotApiEnabled,
} from "@/server/profit-razer-bot-settings";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const settings = await getRazerBotSettings();
    return jsonOk({
      botApi: {
        ...settings,
        endpoints: {
          list: "/api/profit/razer/bot/accounts",
          report: "/api/profit/razer/bot/accounts/{id}/report",
          health: "/api/profit/razer/bot/health",
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "โหลด Bot API config ไม่สำเร็จ");
  }
}

export async function PATCH(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json().catch(() => ({}));
    if (body.enabled == null) {
      throw Object.assign(new Error("ต้องระบุ enabled"), { status: 400 });
    }
    const settings = await setRazerBotApiEnabled(Boolean(body.enabled));
    return jsonOk({ botApi: settings });
  } catch (err) {
    return handleApiError(err, "อัปเดต Bot API ไม่สำเร็จ");
  }
}
