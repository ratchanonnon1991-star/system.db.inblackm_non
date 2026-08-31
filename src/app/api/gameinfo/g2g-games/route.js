import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { addG2GGame, deleteG2GGame, listG2GGames, slugFromG2GUrl } from "@/server/g2g-games-repository";
import { clearG2GCache, inspectG2GGame } from "@/server/g2g-prices";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ games: await listG2GGames() });
  } catch (error) {
    return handleApiError(error, "โหลดรายชื่อเกม G2G ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    const slug = slugFromG2GUrl(body.url);
    const inspected = await inspectG2GGame(slug);
    const game = await addG2GGame(inspected);
    clearG2GCache();
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: null, after: { g2gGame: game.label, slug: game.slug } });
    return jsonOk({ game, games: await listG2GGames() });
  } catch (error) {
    return handleApiError(error, "เพิ่มเกม G2G ไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const value = new URL(request.url).searchParams.get("game") || "";
    const game = await deleteG2GGame(value);
    clearG2GCache();
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: { g2gGame: game.label, slug: game.slug }, after: null });
    return jsonOk({ game, games: await listG2GGames() });
  } catch (error) {
    return handleApiError(error, "ลบเกม G2G ไม่สำเร็จ");
  }
}
