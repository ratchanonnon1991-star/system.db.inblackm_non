import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { testDatabaseConnection } from "@/lib/db";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";

// Test either a saved connection ({ connectionId }) or an unsaved form config
// ({ host, port, database, username, password, ssl }). For a saved connection
// a blank password in the body means "use the stored one".
export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();

    let config;
    if (body.connectionId) {
      const saved = await findConnectionWithSecret(body.connectionId);
      if (!saved) return jsonError("ไม่พบฐานข้อมูลนี้", 404);
      config = {
        host: String(body.host || saved.host),
        port: Number(body.port || saved.port),
        database: String(body.database || saved.database),
        username: String(body.username || saved.username),
        password: body.password ? String(body.password) : saved.password,
        ssl: body.ssl !== undefined ? Boolean(body.ssl) : saved.ssl,
      };
    } else {
      config = {
        host: String(body.host || "").trim(),
        port: Number(body.port || 5432),
        database: String(body.database || "").trim(),
        username: String(body.username || "").trim(),
        password: String(body.password || ""),
        ssl: Boolean(body.ssl),
      };
      if (!config.host || !config.database || !config.username) {
        return jsonError("กรุณากรอก host, database และ username ก่อนทดสอบ", 400);
      }
    }

    const info = await testDatabaseConnection(config);
    return jsonOk({
      ok: true,
      database: info.db,
      user: info.usr,
      version: String(info.version || "").split(" on ")[0],
    });
  } catch (err) {
    if (!err.status) {
      return jsonError(`เชื่อมต่อไม่ได้: ${err.message}`, 502);
    }
    return handleApiError(err, "ทดสอบการเชื่อมต่อไม่สำเร็จ");
  }
}
