import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { requireGameinfoAccess, requireGameinfoMarketChecker, requireGameinfoReporter } from "@/server/auth";
import {
  listGamelistPackListings,
  reviewGamelistPackListing,
  saveGamelistPackListing,
} from "@/server/gameinfo-pack-listings";

function actorName(user) {
  return user.username || user.displayName || String(user.id || "");
}

async function target(request, params) {
  const { id } = await params;
  const gameId = Number(id);
  return {
    gameId: Number.isSafeInteger(gameId) && gameId > 0 ? gameId : null,
    dataMode: normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")),
  };
}

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { gameId, dataMode } = await target(request, params);
    if (!gameId) return jsonError("เกมไม่ถูกต้อง", 400);
    return jsonOk({ listings: await listGamelistPackListings(gameId, dataMode) });
  } catch (error) {
    return handleApiError(error, "โหลดการลงสินค้าไม่สำเร็จ");
  }
}

// Listing a pack: whoever may report problems on GameInfo.
export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoReporter(request);
    const { gameId, dataMode } = await target(request, params);
    if (!gameId) return jsonError("เกมไม่ถูกต้อง", 400);
    const body = await request.json();
    return jsonOk({ listings: await saveGamelistPackListing(gameId, dataMode, body || {}, actorName(user)) });
  } catch (error) {
    return handleApiError(error, "บันทึกการลงสินค้าไม่สำเร็จ");
  }
}

// Checking a listed price: whoever may check market prices.
export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoMarketChecker(request);
    const { gameId, dataMode } = await target(request, params);
    if (!gameId) return jsonError("เกมไม่ถูกต้อง", 400);
    const body = await request.json();
    return jsonOk({ listings: await reviewGamelistPackListing(gameId, dataMode, body || {}, actorName(user)) });
  } catch (error) {
    return handleApiError(error, "บันทึกผลตรวจไม่สำเร็จ");
  }
}
