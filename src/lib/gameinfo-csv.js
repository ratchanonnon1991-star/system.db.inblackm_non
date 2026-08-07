// Dependency-free CSV read/write for the gameinfo pack importer. The repo has
// no SheetJS/xlsx dependency, and a pack cell like channel_main can legitimately
// hold "Wave, funpay" inside quotes, so a naive split(",") is wrong — this is a
// small RFC-4180-style parser that respects quoted fields.

/** Parse CSV text into { headers, rows } where each row is a plain object
 * keyed by header. Handles quoted fields containing commas/newlines, escaped
 * quotes ("" -> "), a leading UTF-8 BOM, and CRLF or LF line endings. */
export function parseCsv(text) {
  const src = stripBom(String(text ?? ""));
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let started = false; // has the current record seen any character at all?

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
      started = true;
    } else if (ch === "\r") {
      // swallow; the \n (or end) closes the record
    } else if (ch === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      started = false;
    } else {
      field += ch;
      started = true;
    }
  }
  // Flush the final field/record unless the file ended on a clean newline.
  if (started || field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }

  if (!records.length) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = [];
  for (let r = 1; r < records.length; r += 1) {
    const cells = records[r];
    // A trailing blank line parses to a single empty field — skip it.
    if (cells.length === 1 && cells[0] === "") continue;
    const row = {};
    headers.forEach((header, c) => {
      row[header] = cells[c] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

/** Serialize rows (array of objects) to CSV text using the given header order.
 * Does NOT prepend a BOM — callers that hand the file to Excel should prefix
 * "﻿" themselves so Thai renders correctly. */
export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  }
  return lines.join("\r\n");
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function escapeCsv(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
