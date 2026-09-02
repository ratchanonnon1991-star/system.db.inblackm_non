import { handleApiError, jsonOk } from "@/lib/http";
import { getRazerBotApiConfig, extractProvidedKey } from "@/server/razer-bot-auth";

export async function GET(request) {
  try {
    const config = await getRazerBotApiConfig();
    if (!config.enabled) {
      return jsonOk({ ok: false, enabled: false, message: "Bot API is disabled" }, 503);
    }
    const provided = extractProvidedKey(request);
    if (!provided) {
      return jsonOk({ ok: false, enabled: true, authenticated: false }, 401);
    }
    const { verifyRazerBotApiKey } = await import("@/server/profit-razer-bot-settings");
    await verifyRazerBotApiKey(provided);
    return jsonOk({ ok: true, enabled: true, authenticated: true });
  } catch (err) {
    if (err.status === 401) {
      return jsonOk({ ok: false, enabled: true, authenticated: false }, 401);
    }
    return handleApiError(err, "Bot API health check failed");
  }
}
