import { verifyBridgeRequest } from "@/server/itune-order-bridge-auth";
import { loadWorkforceReport } from "@/server/workforce-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The TopUp admin dashboard's Workforce tab, server to server. It shares the iTune bridge's secret,
// and the "workforce" prefix keeps a signature for one endpoint from verifying on the other.
export async function POST(request) {
  try {
    if (Number(request.headers.get("content-length")) > 1024) return Response.json({ error: "Request too large" }, { status: 413 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1024) return Response.json({ error: "Request too large" }, { status: 413 });
    verifyBridgeRequest(request.headers, `workforce\n${raw}`);
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const report = await loadWorkforceReport({ date: body?.date, channel: body?.channel });
    return Response.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[workforce] bridge", error.code || error.status || "internal");
    return Response.json({ error: error.status ? error.message : "โหลดข้อมูลไม่สำเร็จ" }, { status: error.status || 500 });
  }
}
