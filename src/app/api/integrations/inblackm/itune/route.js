import { verifyBridgeRequest } from "@/server/itune-order-bridge-auth";
import { runOrderBridge } from "@/server/itune-order-usage";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    if (Number(request.headers.get("content-length")) > 16384) return Response.json({ error: "Request too large" }, { status: 413 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16384) return Response.json({ error: "Request too large" }, { status: 413 });
    verifyBridgeRequest(request.headers, raw);
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    if (!body || typeof body !== "object") return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json(await runOrderBridge(body, Number(request.headers.get("x-itune-timestamp")) + 7000), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (!err.status || err.status >= 500) console.error("iTune bridge failed", err);
    return Response.json({ error: err.status && err.status < 500 ? err.message : "เชื่อมต่อ iTune ไม่สำเร็จ" }, { status: err.status || 500 });
  }
}
