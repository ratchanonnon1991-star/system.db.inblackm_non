import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  createGameinfoBotChannel,
  listGameinfoBotChannels,
} from "@/server/gameinfo-bot-channels";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ channels: await listGameinfoBotChannels() });
  } catch (error) {
    return handleApiError(error, "โหลดข้อมูล Game Bot Auto ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireGameinfoEditor(request);
    return jsonOk({ channel: await createGameinfoBotChannel(await request.json()) }, 201);
  } catch (error) {
    return handleApiError(error, "เพิ่มช่องทาง Game Bot Auto ไม่สำเร็จ");
  }
}
