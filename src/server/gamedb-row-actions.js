import { quoteIdentifier } from "@/lib/gamedb-identifier";

// Row actions call another service (a bot, an internal API) with values taken
// from the clicked row.
//
// The target is configured by an admin, not sent by the browser, but that alone
// is not enough of a boundary: an admin account would otherwise be able to make
// the server issue requests anywhere inside the network. So the host must also
// appear in GAMEDB_ACTION_HOSTS. With that variable unset the whole feature
// stays off, which is the right default for an existing deployment.
const TIMEOUT_MS = 10000;

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function allowedActionHosts() {
  return (process.env.GAMEDB_ACTION_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function assertActionUrlAllowed(rawUrl) {
  const hosts = allowedActionHosts();
  if (hosts.length === 0) {
    throw createHttpError(
      "ยังไม่ได้เปิดใช้ปุ่ม action — ตั้งค่า GAMEDB_ACTION_HOSTS ใน .env ก่อน (ใส่ host ที่อนุญาต คั่นด้วย ,)",
      403
    );
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw createHttpError(`URL ของ action ไม่ถูกต้อง: ${rawUrl}`, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw createHttpError("อนุญาตเฉพาะ http/https", 400);
  }
  const target = url.host.toLowerCase();
  if (!hosts.includes(target)) {
    throw createHttpError(
      `host "${target}" ไม่อยู่ในรายการที่อนุญาต (GAMEDB_ACTION_HOSTS): ${hosts.join(", ")}`,
      403
    );
  }
  return url;
}

/**
 * Replaces {column} in a template with values from the row.
 *
 * The name may not contain a brace, a quote or a colon. Without that, a JSON
 * body template such as {"id":"{id}"} matches from its opening brace to the
 * first closing one and the JSON itself gets swallowed.
 */
export function fillTemplate(template, values, encode) {
  return String(template || "").replace(/\{([^{}":]+)\}/g, (_, name) => {
    const value = values[name.trim()];
    const text = value === null || value === undefined ? "" : String(value);
    return encode ? encodeURIComponent(text) : text;
  });
}

export async function runRowAction(action, values) {
  const url = assertActionUrlAllowed(fillTemplate(action.url, values, true));
  const method = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(action.method)
    ? action.method
    : "POST";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: action.bodyTemplate ? { "Content-Type": "application/json" } : undefined,
      body:
        action.bodyTemplate && method !== "GET"
          ? fillTemplate(action.bodyTemplate, values, false)
          : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      // Enough to see what happened without dumping a whole page into the UI.
      body: text.slice(0, 2000),
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw createHttpError("เรียก action ไม่สำเร็จ: หมดเวลา 10 วินาที", 504);
    }
    throw createHttpError(`เรียก action ไม่สำเร็จ: ${err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

// Re-exported so the actions config can reuse the identifier check when it
// names the columns a template may read.
export { quoteIdentifier };
