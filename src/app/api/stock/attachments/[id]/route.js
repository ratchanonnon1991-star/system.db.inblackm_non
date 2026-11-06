import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { readAttachment, removeAttachment } from "@/server/stock-attachment-repository";
import { attachmentDisposition, attachmentOpensInline } from "@/lib/stock-attachments";

// One attached file. Served sandboxed with the type its bytes were checked as, so a
// file cannot run script on this site; an e-mail downloads instead of opening.
export async function GET(request, { params }) {
  try {
    await requireStockAccess(request);
    const { id } = await params;
    const file = await readAttachment(id);
    if (!file) return new Response("ไม่พบไฟล์นี้", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const { attachment, bytes } = file;
    const inline = attachmentOpensInline(attachment.contentType) && !new URL(request.url).searchParams.has("download");
    return new Response(bytes, {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": attachmentDisposition(attachment.fileName, inline),
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    return handleApiError(error, "เปิดไฟล์แนบไม่สำเร็จ");
  }
}

// Takes the file off (only whoever attached it); it stays stored with who took it off.
export async function DELETE(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    return jsonOk(await removeAttachment(id, { id: user.id, name: user.displayName || user.username }));
  } catch (error) {
    return handleApiError(error, "เอาไฟล์ออกไม่สำเร็จ");
  }
}
