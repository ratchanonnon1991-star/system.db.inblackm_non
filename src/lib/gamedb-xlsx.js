// Minimal XLSX writer: one sheet per panel, no dependency.
//
// Cells carry the same tones the table shows on screen, and a column's header
// group becomes a merged band across the columns it covers.
//
// An .xlsx file is a ZIP of XML parts. Everything here is written with the ZIP
// "store" method (no compression), which keeps the format to a CRC and a couple
// of fixed-size headers — far less code than pulling in a spreadsheet library
// for what is a table of strings and numbers.
import { CELL_TONES } from "@/lib/gamedb-layout";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Excel rejects most control characters outright.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// Excel limits sheet names to 31 chars and forbids : \ / ? * [ ]
function safeSheetName(name, index, used) {
  let base = String(name || `Sheet${index + 1}`)
    .replace(/[:\\/?*[\]]/g, "-")
    .slice(0, 31)
    .trim();
  if (!base) base = `Sheet${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const trimmed = base.slice(0, 31 - String(suffix).length - 1);
    candidate = `${trimmed}~${suffix}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Whether a cell should be stored as a number.
 *
 * Looking at the text alone is not enough: "0812345678" and "007" are perfectly
 * good numbers to Javascript and arrive in Excel as 812345678 and 7. The column
 * type from Postgres decides it when the caller passes one; without a type, a
 * string only counts as numeric if it survives the round trip unchanged.
 */
function isNumericCell(value, type) {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "number") return Number.isFinite(value);
  const text = String(value);
  if (text === "" || !Number.isFinite(Number(text))) return false;
  if (type) return type === "number";
  return String(Number(text)) === text;
}

/**
 * Collects the styles a workbook actually uses and writes styles.xml for them.
 *
 * Excel addresses a cell's look by an index into cellXfs, so every distinct
 * combination of fill and font has to be registered up front. Only tones that
 * appear anywhere in the workbook get an entry, which keeps the part small for
 * the common case of no colour at all.
 */
function createStyleTable() {
  // Index 0 is "no fill" and index 1 must be gray125; Excel reserves both, and
  // a colour landing on either is silently ignored.
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const fillIndex = new Map();
  const fonts = [
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
  ];
  const fontIndex = new Map([
    ["0:", 0],
    ["1:", 1],
  ]);
  // 0 = plain, 1 = bold: the two the writer has always had.
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
  ];
  const xfIndex = new Map([
    ["cell:", 0],
    ["head:", 1],
  ]);

  const argb = (hex) => `FF${hex.replace("#", "").toUpperCase()}`;

  const fillFor = (hex) => {
    if (!fillIndex.has(hex)) {
      fills.push(
        `<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`
      );
      fillIndex.set(hex, fills.length - 1);
    }
    return fillIndex.get(hex);
  };

  const fontFor = (hex, bold) => {
    const key = `${bold ? 1 : 0}:${hex}`;
    if (!fontIndex.has(key)) {
      fonts.push(
        `<font>${bold ? "<b/>" : ""}<color rgb="${argb(hex)}"/><sz val="11"/><name val="Calibri"/></font>`
      );
      fontIndex.set(key, fonts.length - 1);
    }
    return fontIndex.get(key);
  };

  return {
    /** kind: "cell" (plain) or "head" (bold, and the tone's header shade). */
    idFor(kind, tone) {
      const key = `${kind}:${tone || ""}`;
      if (xfIndex.has(key)) return xfIndex.get(key);
      const entry = CELL_TONES[tone];
      if (!entry) return kind === "head" ? 1 : 0;
      const bold = kind === "head";
      const background = bold ? entry.head : entry.bg;
      const colour = bold ? entry.headFg || "#27272a" : entry.fg;
      xfs.push(
        `<xf numFmtId="0" fontId="${fontFor(colour, bold)}" fillId="${fillFor(background)}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`
      );
      xfIndex.set(key, xfs.length - 1);
      return xfs.length - 1;
    },
    xml() {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    },
  };
}

function cellXml(reference, value, styleId, numeric) {
  const style = styleId ? ` s="${styleId}"` : "";
  if (numeric) return `<c r="${reference}"${style}><v>${Number(value)}</v></c>`;
  const text = value === null || value === undefined ? "" : String(value);
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function sheetXml(sheet, styles) {
  const groups = (sheet.groups || []).filter((group) => group && group.span > 0);
  const hasGroupRow = groups.some((group) => group.label);
  const rowsXml = [];
  const merges = [];

  if (hasGroupRow) {
    let column = 0;
    const cells = groups.map((group) => {
      const start = column;
      column += group.span;
      if (group.span > 1) {
        merges.push(`${columnName(start)}1:${columnName(column - 1)}1`);
      }
      // Only the first cell of a merge carries the value; the rest have to
      // exist and be empty, or Excel treats the sheet as damaged.
      return (
        cellXml(`${columnName(start)}1`, group.label, styles.idFor("head", group.tone), false) +
        Array.from({ length: group.span - 1 }, (_, offset) =>
          cellXml(`${columnName(start + offset + 1)}1`, "", styles.idFor("head", group.tone), false)
        ).join("")
      );
    });
    rowsXml.push(`<row r="1">${cells.join("")}</row>`);
  }

  const firstRow = hasGroupRow ? 2 : 1;
  const headerCells = sheet.headers
    .map((value, colIndex) =>
      cellXml(
        `${columnName(colIndex)}${firstRow}`,
        value,
        styles.idFor("head", sheet.headerTones?.[colIndex]),
        false
      )
    )
    .join("");
  rowsXml.push(`<row r="${firstRow}">${headerCells}</row>`);

  sheet.rows.forEach((cells, rowIndex) => {
    const rowNumber = firstRow + 1 + rowIndex;
    const cellsXml = cells
      .map((value, colIndex) =>
        cellXml(
          `${columnName(colIndex)}${rowNumber}`,
          value,
          styles.idFor("cell", sheet.cellTones?.[rowIndex]?.[colIndex]),
          isNumericCell(value, sheet.types?.[colIndex])
        )
      )
      .join("");
    rowsXml.push(`<row r="${rowNumber}">${cellsXml}</row>`);
  });

  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join("")}</sheetData>${mergeXml}</worksheet>`;
}

function buildParts(sheets) {
  const used = new Set();
  const named = sheets.map((sheet, index) => ({
    ...sheet,
    safeName: safeSheetName(sheet.name, index, used),
  }));

  const parts = [
    {
      path: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join("")}</Types>`,
    },
    {
      path: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
        .map(
          (sheet, index) =>
            `<sheet name="${escapeXml(sheet.safeName)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
        )
        .join("")}</sheets></workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
        )
        .join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
  ];

  // The sheets are written first so styles.xml knows every tone it has to
  // define by the time it is generated.
  const styles = createStyleTable();
  const sheetParts = named.map((sheet, index) => ({
    path: `xl/worksheets/sheet${index + 1}.xml`,
    data: sheetXml(sheet, styles),
  }));

  parts.push({ path: "xl/styles.xml", data: styles.xml() }, ...sheetParts);
  return parts;
}

/**
 * sheets: [{ name, headers, types?, rows, headerTones?, cellTones?, groups? }]
 * → Blob (.xlsx). Tones are names from CELL_TONES; groups are
 * [{ label, tone, span }] left to right, spanning every column.
 */
export function buildXlsxBlob(sheets) {
  return buildZipBlob(buildParts(sheets), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

// Shared store-only ZIP writer; extension downloads reuse the same tested format.
export function buildZipBlob(files, type = "application/zip") {
  const encoder = new TextEncoder();
  const parts = files.map((part) => ({
    nameBytes: encoder.encode(part.path),
    dataBytes: encoder.encode(part.data),
  }));

  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (value) => [value & 0xff, (value >> 8) & 0xff];
  const u32 = (value) => [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];

  for (const part of parts) {
    const crc = crc32(part.dataBytes);
    const size = part.dataBytes.length;
    const header = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0),  // flags
      ...u16(0),  // method: store
      ...u16(0),  // time
      ...u16(0),  // date
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(part.nameBytes.length),
      ...u16(0),
    ];
    chunks.push(new Uint8Array(header), part.nameBytes, part.dataBytes);

    central.push({
      crc,
      size,
      offset,
      nameBytes: part.nameBytes,
    });
    offset += header.length + part.nameBytes.length + size;
  }

  const directoryStart = offset;
  for (const entry of central) {
    const header = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(entry.crc),
      ...u32(entry.size),
      ...u32(entry.size),
      ...u16(entry.nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(entry.offset),
    ];
    chunks.push(new Uint8Array(header), entry.nameBytes);
    offset += header.length + entry.nameBytes.length;
  }

  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(central.length),
    ...u16(central.length),
    ...u32(offset - directoryStart),
    ...u32(directoryStart),
    ...u16(0),
  ];
  chunks.push(new Uint8Array(end));

  return new Blob(chunks, { type });
}
