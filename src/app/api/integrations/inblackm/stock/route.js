import { verifyBridgeRequest } from "@/server/itune-order-bridge-auth";
import { getStockWebSync, listStockAccounts } from "@/server/stock-repository";
import { listStockGames } from "@/server/stock-games";
import { stockBalanceReport } from "@/lib/stock-balance-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The TopUp admin's สต็อกคงเหลือ page, server to server, read only. It shares the iTune bridge's
// secret, and the "stock-balance" prefix keeps a signature for one endpoint from verifying on another.
export async function POST(request) {
  try {
    if (Number(request.headers.get("content-length")) > 1024) return Response.json({ error: "Request too large" }, { status: 413 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1024) return Response.json({ error: "Request too large" }, { status: 413 });
    verifyBridgeRequest(request.headers, `stock-balance\n${raw}`);
    const [accounts, games, webSync] = await Promise.all([listStockAccounts(), listStockGames(), getStockWebSync()]);
    return Response.json({ report: stockBalanceReport(accounts, games, { webSync }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[stock-balance] bridge", error.code || error.status || "internal");
    return Response.json({ error: error.status ? error.message : "โหลดข้อมูลไม่สำเร็จ" }, { status: error.status || 500 });
  }
}
