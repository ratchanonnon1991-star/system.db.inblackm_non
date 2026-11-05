// Reads what the Sheets API cannot give: the pictures placed over a sheet's
// cells. An .xlsx export carries them as xl/media files, anchored to a cell by
// each sheet's drawing. Only what the GameInfo sheet import needs is read —
// sheet titles, text cells, and picture anchors — with node's own zlib.
import { inflateRawSync } from "node:zlib";

function unzip(buffer) {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("ไฟล์ .xlsx เสีย (ไม่พบ ZIP directory)");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.set(name, {
      method: buffer.readUInt16LE(offset + 10),
      size: buffer.readUInt32LE(offset + 20),
      local: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  const read = (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    const start = entry.local + 30 + buffer.readUInt16LE(entry.local + 26) + buffer.readUInt16LE(entry.local + 28);
    const data = buffer.subarray(start, start + entry.size);
    return entry.method === 0 ? Buffer.from(data) : inflateRawSync(data);
  };
  return { has: (name) => entries.has(name), read, text: (name) => read(name)?.toString("utf8") ?? null };
}

function decodeXml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function relationships(xml) {
  return Object.fromEntries([...String(xml || "").matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

// "../media/image3.png" relative to "xl/drawings/" → "xl/media/image3.png"
function resolvePath(base, target) {
  const parts = base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/**
 * The workbook's sheets: [{ title, cells: [{ row, col, text }], images:
 * [{ row, col, media }] }] — rows 1-based, col a letter for cells and a
 * 0-based index for images (as the drawing stores it). `media(path)` returns
 * a picture's bytes. `titles` (a Set) reads only those sheets. `numbers` also
 * keeps number / error cells (as their raw text, e.g. "46099" or "#DIV/0!").
 */
export function readXlsxSheetsWithImages(buffer, { titles = null, numbers = false } = {}) {
  const zip = unzip(buffer);
  const strings = [...String(zip.text("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const workbookRels = relationships(zip.text("xl/_rels/workbook.xml.rels"));
  const sheets = [];
  for (const match of String(zip.text("xl/workbook.xml") || "").matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    // `titles` limits the work to the sheets wanted; the rest are never inflated.
    if (titles && !titles.has(decodeXml(match[1]))) continue;
    const path = resolvePath("xl/workbook.xml", workbookRels[match[2]] || "");
    const xml = zip.text(path);
    if (!xml) continue;
    const cells = [];
    // Google writes thousands of styled empty cells as <c …/>; matching them as
    // such keeps this linear (a lazy scan to the next </c> from each one did
    // not, and gave a later cell's text the empty cell's address).
    for (const cell of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (cell[4] == null) continue;
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[4])?.[1];
      let text = "";
      if (/t="s"/.test(cell[3]) && value != null) text = strings[Number(value)] || "";
      else if (/t="inlineStr"/.test(cell[3])) text = decodeXml([...cell[4].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else if (/t="str"/.test(cell[3]) && value != null) text = decodeXml(value);
      else if (numbers && value != null) text = decodeXml(value);
      if (text.trim()) cells.push({ row: Number(cell[2]), col: cell[1], text });
    }
    const images = [];
    const sheetRelsPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
    const drawingTarget = Object.values(relationships(zip.text(sheetRelsPath))).find((target) => /drawings\/drawing\d+\.xml$/.test(target));
    if (drawingTarget) {
      const drawingPath = resolvePath(path, drawingTarget);
      const drawingRels = relationships(zip.text(drawingPath.replace(/([^/]+)$/, "_rels/$1.rels")));
      for (const anchor of String(zip.text(drawingPath) || "").matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
        const from = /<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(anchor[0]);
        const embed = /r:embed="([^"]+)"/.exec(anchor[0]);
        if (!from || !embed || !drawingRels[embed[1]]) continue;
        images.push({ row: Number(from[2]) + 1, col: Number(from[1]), media: resolvePath(drawingPath, drawingRels[embed[1]]) });
      }
    }
    sheets.push({ title: decodeXml(match[1]), cells, images });
  }
  return { sheets, media: (path) => zip.read(path) };
}
