// Which files to fetch from the Drive folder "ข้อมูลบัญชี 2026" (one subfolder per month,
// "ข้อมูลบัญชี M-YYYY") for the account-sheet import (scripts/sync-account-sheets.mjs).
// Pure: the sync script and the tests share it.
import { sheetPeriod } from "@/lib/account-sheets";

// https://drive.google.com/drive/folders/15WHNaqYTHVQId_3jvyDch3tF66ZrkxIl ; ACCOUNT_SHEETS_DRIVE_FOLDER overrides.
export const ACCOUNT_SHEETS_DRIVE_FOLDER = "15WHNaqYTHVQId_3jvyDch3tF66ZrkxIl";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const SYNC_MODES = ["preview", "apply"];
export const SYNC_STATUS_LABELS = { running: "กำลังซิงค์", done: "เสร็จ", failed: "ไม่สำเร็จ" };

/** A Drive folder id from an id or a folder link; "" when it is neither. */
export function driveFolderId(value) {
  const text = String(value || "").trim();
  const fromLink = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(text);
  if (fromLink) return fromLink[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : "";
}

/** A Drive name made safe as one path segment on disk. */
export function safeFileName(name) {
  return String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "_").trim().slice(0, 180) || "_";
}

/** The month folders in the root listing, oldest first: [{ id, name, period }]. */
export function monthFolders(entries) {
  return (entries || [])
    .filter((entry) => entry.mimeType === DRIVE_FOLDER_MIME && sheetPeriod(entry.name))
    .map((entry) => ({ id: entry.id, name: entry.name, period: sheetPeriod(entry.name) }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.name.localeCompare(b.name));
}

/**
 * One month folder's listing → what to fetch: an uploaded .xlsx is downloaded, a Google Sheet
 * is exported as .xlsx, anything else (.docx, PDFs) is listed as skipped.
 * { fetch: [{ id, fileName, how: "download" | "export" }], skipped: [name] }
 */
export function filesToFetch(entries) {
  const fetch = [];
  const skipped = [];
  const taken = new Set();
  for (const entry of [...(entries || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const isXlsx = entry.mimeType === XLSX_MIME || /\.xlsx$/i.test(entry.name);
    const how = entry.mimeType === DRIVE_SHEET_MIME ? "export" : isXlsx && entry.mimeType !== DRIVE_FOLDER_MIME ? "download" : null;
    if (!how) {
      skipped.push(entry.name);
      continue;
    }
    const base = safeFileName(String(entry.name).replace(/\.xlsx$/i, ""));
    // Two files of one name in a folder (a copy) must not overwrite each other on disk.
    let fileName = `${base}.xlsx`;
    for (let n = 2; taken.has(fileName.toLowerCase()); n += 1) fileName = `${base} (${n}).xlsx`;
    taken.add(fileName.toLowerCase());
    fetch.push({ id: entry.id, fileName, how });
  }
  return { fetch, skipped };
}
