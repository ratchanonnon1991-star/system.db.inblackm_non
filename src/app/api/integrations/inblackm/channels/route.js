import { verifyBridgeRequest } from "@/server/itune-order-bridge-auth";
import { runChannelBridge } from "@/server/inventory-channel-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reserved accounts and usage on the inblackm order pages, server to server. It shares the iTune
// bridge's secret; the "channels" prefix keeps a signature for one endpoint from verifying on another.
export async function POST(request) {
  try {
    if (Number(request.headers.get("content-length")) > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
    verifyBridgeRequest(request.headers, `channels\n${raw}`);
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json(await runChannelBridge(body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!error.status || error.status >= 500) console.error("[channel-bridge]", error.code || "internal");
    return Response.json({ error: error.status && error.status < 500 ? error.message : "เชื่อมต่อระบบจองช่องทางไม่สำเร็จ" }, { status: error.status || 500 });
  }
}
