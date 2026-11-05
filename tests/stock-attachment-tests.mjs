import assert from "node:assert/strict";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentDisposition,
  attachmentOpensInline,
  attachmentOwner,
  attachmentRemoveError,
  attachmentStorageKey,
  cleanAttachmentName,
  formatAttachmentSize,
  sniffAttachment,
} from "../src/lib/stock-attachments.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

const bytes = (...parts) => Buffer.concat(parts.map((part) => (typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part))));
const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "rest");

check(sniffAttachment(png, "slip.jpg").contentType === "image/png", "a PNG is a PNG whatever its name says");
check(sniffAttachment(bytes([0xff, 0xd8, 0xff, 0xe0], "x")).ext === ".jpg", "JPEG by its signature");
check(sniffAttachment(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 ")).contentType === "image/webp", "WebP by RIFF…WEBP");
check(sniffAttachment(bytes("GIF89a...")).contentType === "image/gif", "GIF");
check(sniffAttachment(bytes("%PDF-1.7\n")).contentType === "application/pdf", "PDF");
check(sniffAttachment(Buffer.from("From: supplier@x.com\nSubject: ส่งของแล้ว\n\nครับ"), "reply.EML").contentType === "message/rfc822", "an .eml that is text is an e-mail");
check(sniffAttachment(Buffer.from("ซัพตอบว่าส่งแล้ว"), "อีเมล.txt").contentType.startsWith("text/plain"), "pasted e-mail text is kept as .txt");
check(Boolean(sniffAttachment(Buffer.from("<html><script>alert(1)</script>"), "page.html").error), "HTML is refused");
check(Boolean(sniffAttachment(Buffer.from("<svg onload=alert(1)>"), "logo.svg").error), "SVG is refused: it can carry script");
check(Boolean(sniffAttachment(bytes([0x4d, 0x5a, 0x90, 0x00]), "notes.txt").error), "binary bytes named .txt are refused");
check(Boolean(sniffAttachment(Buffer.alloc(0), "a.png").error), "an empty file is refused");
check(Boolean(sniffAttachment(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0x41), "a.txt").error), "a file over the limit is refused");

check(cleanAttachmentName("C:\\fakepath\\สลิป โอน.png") === "สลิป โอน.png", "folders the browser sends are dropped");
check(cleanAttachmentName("../../etc/passwd") === "passwd", "no path climbing in a name");
check(cleanAttachmentName('a"b\r\n<c>.pdf') === "abc.pdf", "quotes, line breaks and angle brackets are dropped");
check(cleanAttachmentName("..") === "ไฟล์แนบ" && cleanAttachmentName("") === "ไฟล์แนบ", "a name with nothing left gets a default");
{
  const long = cleanAttachmentName(`${"ก".repeat(200)}.pdf`);
  check(long.length === 120 && long.endsWith(".pdf"), "a long name is cut but keeps its extension");
}

check(attachmentOwner("po", "12").id === 12 && attachmentOwner("wallet_entry", 3).kind === "wallet_entry", "orders and wallet entries take files");
check(Boolean(attachmentOwner("users", 1).error) && Boolean(attachmentOwner("po", "1;DROP").error) && Boolean(attachmentOwner("po", 0).error), "anything else, or a bad id, is refused");
check(Boolean(attachmentOwner("__proto__", 1).error), "prototype keys are not owners");

const hash = "a".repeat(64);
check(attachmentStorageKey(hash, ".pdf") === `aa/${hash}.pdf`, "files are stored by their hash, two letters per folder");
assert.throws(() => attachmentStorageKey("../x", ".pdf"));
passed += 1;

check(attachmentOpensInline("image/png") && attachmentOpensInline("application/pdf") && !attachmentOpensInline("message/rfc822"), "images and PDFs open, e-mails download");
{
  const header = attachmentDisposition("สลิป.png", true);
  check(header.startsWith("inline; filename=\"") && header.includes("filename*=UTF-8''%E0%B8%AA"), "the Thai name is kept for the download");
  check(!/[^\x20-\x7e]/.test(header), "the header itself stays ASCII");
}

const file = { uploadedById: 5, removedAt: null };
check(attachmentRemoveError(file, { id: 5 }) === null && attachmentRemoveError(file, { id: "5" }) === null, "whoever attached a file can take it off");
check(Boolean(attachmentRemoveError(file, { id: 6 })), "someone else cannot");
check(Boolean(attachmentRemoveError({ uploadedById: null, removedAt: null }, { id: null })), "a file with no uploader cannot be taken off by nobody");
check(Boolean(attachmentRemoveError({ ...file, removedAt: "2026-11-05" }, { id: 5 })), "a file taken off is not taken off twice");

check(formatAttachmentSize(500) === "500 B" && formatAttachmentSize(2048) === "2 KB" && formatAttachmentSize(2.5 * 1024 * 1024) === "2.5 MB", "sizes read as B, KB, MB");

console.log(`${passed} passed`);
