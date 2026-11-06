import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { createGoogleReader } from "../src/server/google-sheets.js";
import {
  ACCOUNT_SHEETS_DRIVE_FOLDER,
  DRIVE_FOLDER_MIME,
  DRIVE_SHEET_MIME,
  XLSX_MIME,
  driveFolderId,
  filesToFetch,
  monthFolders,
  safeFileName,
} from "../src/lib/account-sheet-drive.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

check(driveFolderId(`https://drive.google.com/drive/u/5/folders/${ACCOUNT_SHEETS_DRIVE_FOLDER}?usp=sharing`) === ACCOUNT_SHEETS_DRIVE_FOLDER
  && driveFolderId(` ${ACCOUNT_SHEETS_DRIVE_FOLDER} `) === ACCOUNT_SHEETS_DRIVE_FOLDER && driveFolderId("x y") === "" && driveFolderId("") === "", "a folder is given by its id or its link");

const months = monthFolders([
  { id: "10", name: "ข้อมูลบัญชี 10-2026", mimeType: DRIVE_FOLDER_MIME },
  { id: "2", name: "ข้อมูลบัญชี 2-2026", mimeType: DRIVE_FOLDER_MIME },
  { id: "x", name: "เก่า", mimeType: DRIVE_FOLDER_MIME },
  { id: "f", name: "ข้อมูลบัญชี 3-2026.xlsx", mimeType: XLSX_MIME },
]);
check(months.map((month) => `${month.id}:${month.period}`).join() === "2:2026-02,10:2026-10", "only month folders are read, oldest first");

const { fetch, skipped } = filesToFetch([
  { id: "a", name: "1.2 บัญชีแลกเงิน 10_2026.xlsx", mimeType: XLSX_MIME },
  { id: "b", name: "1.4 Cash Flow 10_2026", mimeType: DRIVE_SHEET_MIME },
  { id: "c", name: "PO Top Up OOC.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { id: "d", name: "1.2 บัญชีแลกเงิน 10_2026.xlsx", mimeType: XLSX_MIME },
  { id: "e", name: "ย่อย", mimeType: DRIVE_FOLDER_MIME },
]);
check(fetch.find((file) => file.id === "a").how === "download" && fetch.find((file) => file.id === "b").how === "export"
  && fetch.find((file) => file.id === "b").fileName === "1.4 Cash Flow 10_2026.xlsx", "an uploaded .xlsx is downloaded, a Google Sheet is exported as .xlsx");
check(skipped.join() === "PO Top Up OOC.docx,ย่อย", "other files and subfolders are skipped");
check(new Set(fetch.map((file) => file.fileName)).size === fetch.length && fetch.some((file) => file.fileName === "1.2 บัญชีแลกเงิน 10_2026 (2).xlsx"), "two files of one name do not overwrite each other");
check(safeFileName("../a/b:c") === "__a_b_c" && safeFileName("") === "_", "a Drive name cannot climb out of the run folder");

const script = read("../scripts/sync-account-sheets.mjs");
const order = ["stock-go-live-check.mjs\", [\"--clear-old-2-1\"]", "import-account-sheets.mjs\", [folder, \"--apply\"]", "import-sheet-inventory.mjs\", [\"--apply\"]", "link-stock-games.mjs\", [\"--apply\"]"]
  .map((step) => script.indexOf(step));
check(order.every((at) => at > 0) && order.every((at, i) => i === 0 || at > order[i - 1]), "apply clears the old 2.1 import, then the sheets, the inventory and the game links, in that order");
check(/finally \{[\s\S]*rm\(staging/.test(script) && script.includes("readOnly: true"), "the workbooks are deleted after every run and Drive is read with read-only scopes");

const route = read("../src/app/api/stock/sheet-sync/route.js");
check((route.match(/requireStockEditor\(request\)/g) || []).length === 2 && route.includes("cross-site"), "only Stock admins see or start a sync; cross-site posts are refused");
const sync = read("../src/server/account-sheet-sync.js");
check(sync.includes("status = 'running'") && sync.includes("LOCK TABLE account_sheet_sync_runs") && sync.includes("detached: true"), "one run at a time, in its own process");
check(read("../src/app/stock/sheets/page.js").includes("canSync={canManageStock(user)}"), "the button shows only for Stock admins");

// The Drive calls the sync makes, against a stand-in for Google.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const calls = [];
let scopes = "";
const reader = createGoogleReader({
  keyFile: "/test/key.json", readOnly: true, exportAccess: true,
  readKeyFile: async () => JSON.stringify({ client_email: "fixture@example.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
  fetchImpl: async (url, init = {}) => {
    if (url.includes("oauth2")) {
      scopes = JSON.parse(Buffer.from(String(init.body.get("assertion")).split(".")[1], "base64url").toString()).scope;
      return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) };
    }
    calls.push(url);
    if (url.includes("alt=media")) return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("PK-xlsx").buffer };
    const page = new URL(url).searchParams.get("pageToken");
    return { ok: true, status: 200, json: async () => (page ? { files: [{ id: "2", name: "b", mimeType: XLSX_MIME }] } : { files: [{ id: "1", name: "a", mimeType: XLSX_MIME }], nextPageToken: "p2" }) };
  },
});
const listed = await reader.listFolder("folder'1");
check(listed.map((file) => file.id).join() === "1,2" && calls.length === 2, "a folder listing follows every page");
check(new URL(calls[0]).searchParams.get("q") === String.raw`'folder\'1' in parents and trashed = false` && calls[0].includes("supportsAllDrives=true"), "the listing asks for that folder only, shared drives included");
check((await reader.downloadFile("abc")).toString() === "PK-xlsx" && calls[2].includes("/files/abc?alt=media"), "an uploaded workbook is downloaded as is");
check(scopes === "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly", "Drive is read with read-only scopes");

console.log(`account-sheet-drive: ${passed} passed`);
