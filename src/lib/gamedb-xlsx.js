// Minimal XLSX writer: one sheet per panel, no dependency.
//
// An .xlsx file is a ZIP of XML parts. Everything here is written with the ZIP
// "store" method (no compression), which keeps the format to a CRC and a couple
// of fixed-size headers — far less code than pulling in a spreadsheet library
// for what is a table of strings and numbers.

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

function sheetXml(sheet) {
  const rows = [sheet.headers, ...sheet.rows]
    .map((cells, rowIndex) => {
      const cellsXml = cells
        .map((value, colIndex) => {
          const reference = `${columnName(colIndex)}${rowIndex + 1}`;
          const isHeader = rowIndex === 0;
          const numeric =
            !isHeader &&
            value !== null &&
            value !== undefined &&
            value !== "" &&
            typeof value !== "boolean" &&
            Number.isFinite(Number(value)) &&
            String(value).trim() !== "";
          if (numeric) {
            return `<c r="${reference}"><v>${Number(value)}</v></c>`;
          }
          const text = value === null || value === undefined ? "" : String(value);
          return `<c r="${reference}" t="inlineStr"${isHeader ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
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
    {
      path: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    },
  ];

  named.forEach((sheet, index) => {
    parts.push({ path: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet) });
  });

  return parts;
}

/** sheets: [{ name, headers: [string], rows: [[value]] }] → Blob (.xlsx) */
export function buildXlsxBlob(sheets) {
  const encoder = new TextEncoder();
  const parts = buildParts(sheets).map((part) => ({
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

  return new Blob(chunks, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
