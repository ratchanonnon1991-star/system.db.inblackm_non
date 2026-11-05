import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { listAttachments, saveAttachment } from "@/server/stock-attachment-repository";
import { MAX_ATTACHMENT_BYTES } from "@/lib/stock-attachments";

// Files attached to a purchase order or a wallet entry.
// GET ?kind=po|wallet_entry&id=N lists them; POST (multipart: kind, id, file, note) attaches one.
export async function GET(request) {
  try {
    await requireStockAccess(request);
    const params = new URL(request.url).searchParams;
    return jsonOk({ attachments: await listAttachments(params.get("kind"), params.get("id")) });
  } catch (error) {
    return handleApiError(error, "โหลดไฟล์แนบไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_ATTACHMENT_BYTES + 64 * 1024) return jsonError(`ไฟล์ใหญ่เกิน ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`, 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return jsonError("ยังไม่ได้เลือกไฟล์", 400);
    if (file.size > MAX_ATTACHMENT_BYTES) return jsonError(`ไฟล์ใหญ่เกิน ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`, 413);
    const attachment = await saveAttachment({
      kind: String(form.get("kind") || ""),
      id: form.get("id"),
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      note: String(form.get("note") || ""),
    }, { id: user.id, name: user.displayName || user.username });
    return jsonOk({ attachment }, 201);
  } catch (error) {
    return handleApiError(error, "แนบไฟล์ไม่สำเร็จ");
  }
}
