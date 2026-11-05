// Files people attach to a purchase order or a wallet entry: a slip, a PDF, or the
// supplier's e-mail reply (.eml, or its text pasted in and kept as .txt).
// Pure: the repository (src/server/stock-attachment-repository.js) stores them.
// What a file is comes from its bytes, never from the name or type the browser sent.

export const ATTACHMENT_OWNERS = {
  po: { table: "stock_purchase_orders", label: "ใบสั่งซื้อ" },
  wallet_entry: { table: "stock_wallet_entries", label: "รายการกระเป๋าเงิน" },
};
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_OWNER = 30;
export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.eml,message/rfc822,.txt,text/plain";

const startsWith = (buffer, bytes, at = 0) => bytes.every((byte, index) => buffer[at + index] === byte);
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

/** "owner" → { kind, id } or { error }: what a file is attached to. */
export function attachmentOwner(kind, id) {
  if (!Object.hasOwn(ATTACHMENT_OWNERS, kind)) return { error: "ไม่รู้ว่าจะแนบไฟล์กับอะไร" };
  const ownerId = Number(id);
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return { error: "ไม่พบรายการที่จะแนบไฟล์" };
  return { kind, id: ownerId };
}

/** A name safe to show and to send back in Content-Disposition: no folders, no control characters. */
export function cleanAttachmentName(name, fallback = "ไฟล์แนบ") {
  const base = String(name || "").split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || /^\.+$/.test(base)) return fallback;
  if (base.length <= 120) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 8 ? base.slice(dot) : "";
  return base.slice(0, 120 - ext.length) + ext;
}

function isText(buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * The file's bytes and name → { contentType, ext } or { error } in Thai.
 * Images (PNG, JPEG, WebP, GIF) and PDF by their signature; .eml and .txt only when
 * the bytes are UTF-8 text.
 */
export function sniffAttachment(buffer, fileName = "") {
  if (!buffer?.length) return { error: "ไฟล์ว่าง" };
  if (buffer.length > MAX_ATTACHMENT_BYTES) return { error: `ไฟล์ใหญ่เกิน ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB` };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", ext: ".png" };
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", ext: ".jpg" };
  if (startsWith(buffer, ascii("GIF87a")) || startsWith(buffer, ascii("GIF89a"))) return { contentType: "image/gif", ext: ".gif" };
  if (startsWith(buffer, ascii("RIFF")) && startsWith(buffer, ascii("WEBP"), 8)) return { contentType: "image/webp", ext: ".webp" };
  if (startsWith(buffer, ascii("%PDF-"))) return { contentType: "application/pdf", ext: ".pdf" };
  const ext = /\.(eml|txt)$/i.exec(String(fileName))?.[1]?.toLowerCase();
  if (ext && isText(buffer)) return ext === "eml" ? { contentType: "message/rfc822", ext: ".eml" } : { contentType: "text/plain; charset=utf-8", ext: ".txt" };
  return { error: "แนบได้เฉพาะรูป (PNG, JPG, WEBP, GIF), PDF, อีเมล .eml หรือข้อความ .txt" };
}

/** Where the bytes live under the attachments folder: by content, so the same file is stored once. */
export function attachmentStorageKey(sha256, ext) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("sha256 ไม่ถูกต้อง");
  return `${sha256.slice(0, 2)}/${sha256}${ext}`;
}

/** Images and PDF open in the browser; an e-mail or text file downloads. */
export function attachmentOpensInline(contentType) {
  return /^image\/(png|jpeg|webp|gif)$/.test(contentType) || contentType === "application/pdf" || contentType.startsWith("text/plain");
}

/** Content-Disposition with the Thai name kept (RFC 5987) and an ASCII fallback. */
export function attachmentDisposition(name, inline) {
  const clean = cleanAttachmentName(name);
  const fallback = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * Taking a file off → null when allowed, else the reason in Thai. Only whoever attached it,
 * and the file stays stored with who took it off and when.
 */
export function attachmentRemoveError(attachment, actor) {
  if (!attachment || attachment.removedAt) return "ไม่พบไฟล์นี้";
  if (attachment.uploadedById == null || String(attachment.uploadedById) !== String(actor?.id)) return "เอาไฟล์ออกได้เฉพาะคนที่แนบ";
  return null;
}

/** Bytes as "820 KB" / "2.4 MB". */
export function formatAttachmentSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
