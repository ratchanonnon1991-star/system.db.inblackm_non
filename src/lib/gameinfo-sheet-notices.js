// A game's tab in the source sheet ends with "NOTICE (ปัญหาและคำแนะนำ)"
// sections — one per mode ("… UID", "… สำหรับ ID - Pass") or a single one —
// each a list of numbered notes in the first columns with screenshots placed
// over the cells next to them. This turns one tab's text cells and picture
// anchors into GameInfo tutorial categories; the pictures stay as references
// for the server to load.

// Notes sit in the first columns; test accounts and bot links further right are never read.
const NOTE_COLUMNS = new Set(["A", "B", "C"]);
// A section stops at a pack table's header or after this many rows.
const SECTION_ROWS = 80;

function squash(value) {
  return String(value ?? "").replace(/\s+/g, "").toLocaleLowerCase("en");
}

// "NOTICE (ปัญหาเเละคำเเนะนำ) …" — a pack table's own "NOTICE" column is not one.
function isNoticeHeader(text) {
  return /notice/i.test(text) && /ปัญหา|นะนำ/.test(text);
}

// A pack or price-comparison table starts: the notes have ended.
function isTableHeader(text) {
  const key = squash(text);
  return key === "page" || key === "pack" || key.startsWith("ราคาขาย") || key.endsWith("ที่กด") || key.includes("เทียบราคา");
}

function isNumbered(text) {
  return /^\d+\s*[.)]/.test(text);
}

// Notes sometimes carry a login ("Pass : Hero5713"); GameInfo keeps those as encrypted test accounts, not in a guide.
// "Pass : x", "Pass      x" — a label then a value, never "ID - Pass" at the end of a sentence.
const SECRET = /((?:pass(?:word)?|รหัส(?:ผ่าน)?)(?:\s*[:：=]\s*|\s{2,}|\t+))\S+/gi;

export function maskGameinfoNoticeSecrets(text) {
  return String(text).replace(SECRET, "$1••••");
}

// "NOTICE (ปัญหาเเละคำเเนะนำ) สำหรับ ID - Pass" → "ID-Pass"; the sheet spells it many ways.
function sectionMode(text) {
  const mode = String(text).replace(/notice/i, "").replace(/\([^)]*\)/g, "").replace(/สำหรับ/g, "").replace(/\s+/g, " ").trim();
  if (/^uid$/i.test(mode)) return "UID";
  if (/^i[dp]\s*-?\s*pass$/i.test(mode)) return "ID-Pass";
  return mode;
}

function categoryName(mode) {
  return mode ? `ปัญหาและคำแนะนำ (${mode})` : "ปัญหาและคำแนะนำ";
}

/**
 * { cells: [{ row, col, text }], images: [{ row, col, media }] } →
 * [{ name, steps: [{ description, images: [media] }] }], [] when the tab has
 * no NOTICE. A picture goes with the last note at or above it, or the
 * section's first note when it sits above them all; pictures above the first
 * NOTICE (the game's logo) are left out.
 */
export function parseGameinfoSheetNotices({ cells = [], images = [] }) {
  const headers = [];
  for (const cell of [...cells].sort((a, b) => a.row - b.row)) {
    if (isNoticeHeader(cell.text) && !headers.some((header) => header.row === cell.row)) headers.push(cell);
  }
  return headers.map((header, index) => {
    const nextRow = headers[index + 1]?.row ?? Infinity;
    let end = Math.min(nextRow, header.row + SECTION_ROWS);
    const stop = cells.find((cell) => cell.row > header.row && cell.row < end && NOTE_COLUMNS.has(cell.col) && isTableHeader(cell.text));
    if (stop) end = stop.row;
    const byRow = new Map();
    for (const cell of cells) {
      if (cell.row <= header.row || cell.row >= end || !NOTE_COLUMNS.has(cell.col)) continue;
      const text = String(cell.text).trim();
      // A note says something: a quantity like "10000 X 2" is a table's leftover.
      if ((text.match(/\p{L}/gu) || []).length < 2 || text.includes(">>") || isNoticeHeader(text)) continue;
      // Placeholders like "XXXXX" or "vvvvvv".
      if (new Set(text.replace(/\s/g, "").toLocaleLowerCase("en")).size <= 2) continue;
      if (!byRow.has(cell.row)) byRow.set(cell.row, text);
    }
    let notes = [...byRow].sort((a, b) => a[0] - b[0]);
    // Numbered notes are the notes; anything else beside them is a table's leftover.
    if (notes.some(([, text]) => isNumbered(text))) notes = notes.filter(([, text]) => isNumbered(text));
    const steps = notes.map(([row, description]) => ({ row, description: maskGameinfoNoticeSecrets(description), images: [] }));
    const sectionImages = images
      .filter((image) => image.row >= header.row && image.row < Math.min(nextRow, header.row + SECTION_ROWS))
      .sort((a, b) => a.row - b.row || a.col - b.col);
    for (const image of sectionImages) {
      if (!steps.length) steps.push({ row: header.row, description: "", images: [] });
      const owner = [...steps].reverse().find((step) => step.row <= image.row) || steps[0];
      owner.images.push(image.media);
    }
    return { name: categoryName(sectionMode(header.text)), steps: steps.map(({ description, images: pictures }) => ({ description, images: pictures })) };
  }).filter((category) => category.steps.length);
}

export function countGameinfoSheetNotices(categories) {
  return {
    steps: categories.reduce((total, category) => total + category.steps.length, 0),
    images: categories.reduce((total, category) => total + category.steps.reduce((sum, step) => sum + step.images.length, 0), 0),
  };
}

/**
 * A note as a step: its first line (without the "1." the guide numbers
 * itself) is the step's title, any further lines its description.
 */
export function gameinfoNoticeStepText(note) {
  const [first = "", ...rest] = String(note || "").split("\n");
  return { title: first.replace(/^\s*\d+\s*[.)]\s*/, "").trim(), description: rest.join("\n").trim() };
}
