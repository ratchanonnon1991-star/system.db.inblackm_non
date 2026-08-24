import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { addChannelGame, listChannelGames, removeChannelGame } from "@/server/profit-repository";

export async function GET(request, { params }) {
  try {
    await requireProfitAccess(request);
    const { channelId } = await params;
    return jsonOk({ games: await listChannelGames(channelId) });
  } catch (err) {
    return handleApiError(err, "โหลดรายชื่อเกมไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { channelId } = await params;
    const body = await request.json();
    const game = await addChannelGame(channelId, body.name);
    return jsonOk({ game });
  } catch (err) {
    return handleApiError(err, "เพิ่มเกมไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { channelId } = await params;
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    await removeChannelGame(channelId, gameId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบเกมไม่สำเร็จ");
  }
}
