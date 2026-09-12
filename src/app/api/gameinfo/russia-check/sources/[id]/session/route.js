import { jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { deleteRussiaCheckSourceSession, saveRussiaCheckSourceSession } from "@/server/gameinfo-russia-check";

export const maxDuration = 60;

function response(data) {
  const result = jsonOk(data);
  result.headers.set("Cache-Control", "no-store");
  return result;
}

function failure(error) {
  // Never log request bodies, provider responses, tokens or DB parameters.
  const status = error.status || 500;
  const result = jsonOk({
    error: status < 500 || error.safeMessage ? error.message : "จัดการ Login ไม่สำเร็จ กรุณาตรวจการตั้งค่าเซิร์ฟเวอร์",
    retryLogin: Boolean(error.authInvalid) || status === 400,
  }, status);
  result.headers.set("Cache-Control", "no-store");
  return result;
}

function checkOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) throw Object.assign(new Error("ไม่อนุญาตคำขอจากเว็บไซต์อื่น"), { status: 403 });
}

async function readBody(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw Object.assign(new Error("ต้องส่งข้อมูล JSON"), { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("ไม่มี Form Data"), { status: 400 });
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 131072) { await reader.cancel(); throw Object.assign(new Error("ข้อมูลนำเข้าใหญ่เกินขีดจำกัด"), { status: 413 }); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("รูปแบบ JSON ไม่ถูกต้อง"), { status: 400 }); }
}

export async function PUT(request, { params }) {
  try {
    const actor = await requireGameinfoEditor(request);
    checkOrigin(request);
    const { id } = await params;
    const body = await readBody(request);
    return response(await saveRussiaCheckSourceSession(id, body, actor));
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    checkOrigin(request);
    const { id } = await params;
    return response(await deleteRussiaCheckSourceSession(id));
  } catch (error) {
    return failure(error);
  }
}
