import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { razerOverview } from "@/server/profit-razer";
import { getRazerSyncConfig } from "@/server/profit-razer-sync";
import { getRazerBotSettings } from "@/server/profit-razer-bot-settings";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const sync = getRazerSyncConfig();
    const botApi = await getRazerBotSettings();
    return jsonOk({
      overview: await razerOverview(),
      sync: { enabled: sync.enabled, autoSync: sync.autoSync, pollMs: sync.pollMs, url: sync.url ? sync.url.replace(/\/[^/]*$/, "/***") : "" },
      botApi,
    });
  } catch (err) {
    return handleApiError(err, "โหลดภาพรวม Razer ไม่สำเร็จ");
  }
}
