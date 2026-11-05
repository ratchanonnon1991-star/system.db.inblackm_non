import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "@/lib/db";
import {
  ATTACHMENT_OWNERS,
  MAX_ATTACHMENTS_PER_OWNER,
  attachmentOwner,
  attachmentRemoveError,
  attachmentStorageKey,
  cleanAttachmentName,
  sniffAttachment,
} from "@/lib/stock-attachments";

// Files attached to a purchase order or a wallet entry (src/lib/stock-attachments.js).
// The bytes live on this server's disk under STOCK_ATTACHMENTS_DIR (default data/stock-attachments,
// which git ignores), named by their SHA-256; this table says what they belong to and who
// attached them. Taking one off only marks it, so the evidence is never deleted.
// Back that folder up with the database: a row without its file shows as missing.
let schemaReady;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function stockAttachmentsDir() {
  return path.resolve(process.env.STOCK_ATTACHMENTS_DIR || path.join(process.cwd(), "data", "stock-attachments"));
}

export async function ensureAttachmentSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS stock_attachments (
        id               BIGSERIAL PRIMARY KEY,
        owner_kind       VARCHAR(20) NOT NULL CHECK (owner_kind IN (${Object.keys(ATTACHMENT_OWNERS).map((kind) => `'${kind}'`).join(", ")})),
        owner_id         BIGINT NOT NULL,
        file_name        VARCHAR(160) NOT NULL,
        content_type     VARCHAR(80) NOT NULL,
        size_bytes       INTEGER NOT NULL,
        sha256           CHAR(64) NOT NULL,
        storage_key      VARCHAR(100) NOT NULL,
        note             VARCHAR(500) NOT NULL DEFAULT '',
        uploaded_by_id   INTEGER,
        uploaded_by_name VARCHAR(255) NOT NULL DEFAULT '',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        removed_at       TIMESTAMPTZ,
        removed_by_id    INTEGER,
        removed_by_name  VARCHAR(255) NOT NULL DEFAULT ''
      )
    `);
    await getPool().query(`CREATE INDEX IF NOT EXISTS stock_attachments_owner_idx ON stock_attachments (owner_kind, owner_id)`);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function toAttachment(row) {
  return {
    id: Number(row.id),
    ownerKind: row.owner_kind,
    ownerId: Number(row.owner_id),
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    note: row.note,
    uploadedById: row.uploaded_by_id,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    removedAt: row.removed_at,
  };
}

function checkedOwner(kind, id) {
  const owner = attachmentOwner(kind, id);
  if (owner.error) throw createHttpError(owner.error, 400);
  return owner;
}

async function ownerExists(owner) {
  const { table } = ATTACHMENT_OWNERS[owner.kind];
  return (await getPool().query(`SELECT 1 FROM ${table} WHERE id = $1`, [owner.id])).rows.length > 0;
}

/** What is attached to one order or entry, oldest first; files taken off are left out. */
export async function listAttachments(kind, id) {
  const owner = checkedOwner(kind, id);
  await ensureAttachmentSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM stock_attachments WHERE owner_kind = $1 AND owner_id = $2 AND removed_at IS NULL ORDER BY created_at, id`,
    [owner.kind, owner.id]
  );
  return rows.map(toAttachment);
}

/**
 * Stores one file for an order or entry: { kind, id, fileName, bytes (Buffer), note }.
 * The bytes go to disk first (once per content), then the row.
 */
export async function saveAttachment({ kind, id, fileName, bytes, note = "" }, actor) {
  const owner = checkedOwner(kind, id);
  const name = cleanAttachmentName(fileName);
  const type = sniffAttachment(bytes, name);
  if (type.error) throw createHttpError(type.error, 400);
  await ensureAttachmentSchema();
  if (!(await ownerExists(owner))) throw createHttpError(`ไม่พบ${ATTACHMENT_OWNERS[owner.kind].label}นี้`, 404);
  const count = (await getPool().query(
    `SELECT COUNT(*)::int AS n FROM stock_attachments WHERE owner_kind = $1 AND owner_id = $2 AND removed_at IS NULL`,
    [owner.kind, owner.id]
  )).rows[0].n;
  if (count >= MAX_ATTACHMENTS_PER_OWNER) throw createHttpError(`แนบได้สูงสุด ${MAX_ATTACHMENTS_PER_OWNER} ไฟล์ต่อรายการ`, 400);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = attachmentStorageKey(sha256, type.ext);
  const target = path.join(stockAttachmentsDir(), storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  // Write to a temporary name and rename, so a half-written file is never served.
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, bytes, { flag: "wx" });
    await rename(temp, target);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }

  const name160 = name.endsWith(type.ext) || (type.ext === ".jpg" && /\.jpe?g$/i.test(name)) ? name : `${name}${type.ext}`;
  const { rows } = await getPool().query(
    `INSERT INTO stock_attachments (owner_kind, owner_id, file_name, content_type, size_bytes, sha256, storage_key, note, uploaded_by_id, uploaded_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [owner.kind, owner.id, name160.slice(0, 160), type.contentType, bytes.length, sha256, storageKey,
      String(note || "").trim().slice(0, 500), actor?.id ?? null, String(actor?.name || "").slice(0, 255)]
  );
  return toAttachment(rows[0]);
}

/** One file to send back: { attachment, bytes }, or null when there is no such file. */
export async function readAttachment(id) {
  const attachmentId = Number(id);
  if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) return null;
  await ensureAttachmentSchema();
  const row = (await getPool().query(`SELECT * FROM stock_attachments WHERE id = $1 AND removed_at IS NULL`, [attachmentId])).rows[0];
  if (!row) return null;
  const file = path.join(stockAttachmentsDir(), row.storage_key);
  if (!file.startsWith(stockAttachmentsDir() + path.sep)) return null;
  try {
    return { attachment: toAttachment(row), bytes: await readFile(file) };
  } catch (error) {
    if (error.code === "ENOENT") throw createHttpError("ไฟล์นี้หายจากดิสก์ของเซิร์ฟเวอร์ ต้องกู้จากที่สำรองไว้", 410);
    throw error;
  }
}

/** Takes a file off its order or entry (only whoever attached it); the bytes and the row stay. */
export async function removeAttachment(id, actor) {
  const attachmentId = Number(id);
  if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) throw createHttpError("ไม่พบไฟล์นี้", 404);
  await ensureAttachmentSchema();
  const row = (await getPool().query(`SELECT * FROM stock_attachments WHERE id = $1`, [attachmentId])).rows[0];
  const attachment = row ? toAttachment(row) : null;
  const reason = attachmentRemoveError(attachment, actor);
  if (reason) throw createHttpError(reason, attachment && !attachment.removedAt ? 403 : 404);
  await getPool().query(
    `UPDATE stock_attachments SET removed_at = NOW(), removed_by_id = $2, removed_by_name = $3 WHERE id = $1 AND removed_at IS NULL`,
    [attachmentId, actor?.id ?? null, String(actor?.name || "").slice(0, 255)]
  );
  return { id: attachmentId };
}
