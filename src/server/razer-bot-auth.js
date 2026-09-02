import { verifyRazerBotApiKey, getRazerBotSettings } from "@/server/profit-razer-bot-settings";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function getRazerBotApiConfig() {
  return getRazerBotSettings();
}

function extractProvidedKey(request) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerKey = (request.headers.get("x-razer-bot-key") || "").trim();
  return bearer || headerKey;
}

/** Bot payment API — Bearer token or X-Razer-Bot-Key header (no session cookie). */
export async function requireRazerBotApiKey(request) {
  const provided = extractProvidedKey(request);
  await verifyRazerBotApiKey(provided);
}

export { extractProvidedKey };
