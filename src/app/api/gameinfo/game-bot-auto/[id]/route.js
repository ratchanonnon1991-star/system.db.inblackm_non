import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  getGameinfoBotChannel,
  updateGameinfoBotChannel,
} from "@/server/gameinfo-bot-channels";

function channelId(params) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error("รหัสช่องทางไม่ถูกต้อง");
    error.status = 400;
    throw error;
  }
  return id;
}

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const channel = await getGameinfoBotChannel(channelId(await params));
    if (!channel) {
      const error = new Error("ไม่พบช่องทางที่ต้องการ");
      error.status = 404;
      throw error;
    }
    return jsonOk({ channel });
  } catch (error) {
    return handleApiError(error, "โหลดช่องทาง Game Bot Auto ไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    return jsonOk({
      channel: await updateGameinfoBotChannel(channelId(await params), await request.json()),
    });
  } catch (error) {
    return handleApiError(error, "บันทึกช่องทาง Game Bot Auto ไม่สำเร็จ");
  }
}
