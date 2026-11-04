import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { requireGameinfoAccess, requireGameinfoEditor, requireGameinfoReporter } from "@/server/auth";
import { gameinfoListingActor } from "@/lib/gameinfo-pack-listings";
import {
  listGamelistPackListings,
  reviewGamelistPackListing,
  saveGamelistPackListing,
  setGamelistPackChannelOff,
} from "@/server/gameinfo-pack-listings";

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
    return jsonOk({ listings: await saveGamelistPackListing(gameId, dataMode, body || {}, gameinfoListingActor(user)) });
  } catch (error) {
    return handleApiError(error, "บันทึกการลงสินค้าไม่สำเร็จ");
  }
}

// Checking a listed price: an admin, never the one who listed it (the store refuses that).
export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { gameId, dataMode } = await target(request, params);
    if (!gameId) return jsonError("เกมไม่ถูกต้อง", 400);
    const body = await request.json();
    return jsonOk({ listings: await reviewGamelistPackListing(gameId, dataMode, body || {}, gameinfoListingActor(user)) });
  } catch (error) {
    return handleApiError(error, "บันทึกผลตรวจไม่สำเร็จ");
  }
}

// Taking one pack off one sales channel, or back on: an admin.
export async function PATCH(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { gameId, dataMode } = await target(request, params);
    if (!gameId) return jsonError("เกมไม่ถูกต้อง", 400);
    const body = (await request.json()) || {};
    const channelsOff = await setGamelistPackChannelOff(gameId, dataMode, { packId: body.packId, channel: body.channel, off: body.off === true }, gameinfoListingActor(user));
    return jsonOk({ channelsOff });
  } catch (error) {
    return handleApiError(error, "เปิด/ปิดช่องทางไม่สำเร็จ");
  }
}
