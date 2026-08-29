import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { addChannelGame, listChannelGames, removeChannelGame } from "@/server/profit-repository";
import { listGameNames as listOxideGameNames } from "@/server/profit-oxide";
import { listGameNames as listWavepayGameNames } from "@/server/profit-wavepay";
import { listGameNames as listDonshopGameNames } from "@/server/profit-donshop";
import { listGameNames as listGamepointGameNames } from "@/server/profit-gamepoint";
import { listGameNames as listAgenh2hGameNames } from "@/server/profit-agenh2h";
import { listGameNames as listCodaresellerGameNames } from "@/server/profit-codareseller";
import { listGameNames as listNeteaseGameNames } from "@/server/profit-netease";
import { listGameNames as listTruemoneyGameNames } from "@/server/profit-truemoney";
import { listGameNames as listAtomGameNames } from "@/server/profit-atom";
import { listGameNames as listSmartsunGameNames } from "@/server/profit-smartsun";
import { listGameNames as listU9GameNames } from "@/server/profit-u9";

const LIVE_GAME_CHANNELS = {
  oxide: listOxideGameNames,
  wavepay: listWavepayGameNames,
  donshop: listDonshopGameNames,
  gamepoint: listGamepointGameNames,
  agenh2h: listAgenh2hGameNames,
  codareseller: listCodaresellerGameNames,
  netease: listNeteaseGameNames,
  truemoney: listTruemoneyGameNames,
  atom: listAtomGameNames,
  smartsun: listSmartsunGameNames,
  u9: listU9GameNames,
};

export async function GET(request, { params }) {
  try {
    await requireProfitAccess(request);
    const { channelId } = await params;
    // Multi Game Card (oxide) and Wavepay aren't tagged by hand -- their
    // games come straight from codashop_orders.game_name, so id and name
    // are just the name itself.
    const listLiveNames = LIVE_GAME_CHANNELS[channelId];
    if (listLiveNames) {
      const names = await listLiveNames();
      return jsonOk({ games: names.map((name) => ({ id: name, name })) });
    }
    return jsonOk({ games: await listChannelGames(channelId) });
  } catch (err) {
    return handleApiError(err, "โหลดรายชื่อเกมไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { channelId } = await params;
    if (LIVE_GAME_CHANNELS[channelId]) {
      return jsonError("รายชื่อเกมของช่องทางนี้ดึงจาก DB จริง เพิ่มเองไม่ได้", 400);
    }
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
    if (LIVE_GAME_CHANNELS[channelId]) {
      return jsonError("รายชื่อเกมของช่องทางนี้ดึงจาก DB จริง ลบเองไม่ได้", 400);
    }
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    await removeChannelGame(channelId, gameId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบเกมไม่สำเร็จ");
  }
}
