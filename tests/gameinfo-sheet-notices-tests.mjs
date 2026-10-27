import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { countGameinfoSheetNotices, maskGameinfoNoticeSecrets, parseGameinfoSheetNotices } from "../src/lib/gameinfo-sheet-notices.js";
import { readXlsxSheetsWithImages } from "../src/server/xlsx-reader.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

// Laid out like "U.LOVE AND DEEPSPACE": the logo at the top, an ID-Pass
// NOTICE with test accounts beside it, then a UID NOTICE; screenshots below
// or beside the notes they explain.
const cells = [
  { row: 1, col: "B", text: "Love and Deepspace" },
  { row: 222, col: "B", text: "NOTICE (ปัญหาเเละคำเเนะนำ) ID - Pass" },
  { row: 222, col: "N", text: "TESTID" },
  { row: 223, col: "O", text: "someone@example.invalid" },
  { row: 224, col: "B", text: "1.Google NGN error 20 เงินหัก ต้องหยุดใช้และเปลี่ยนบัตรทันที" },
  { row: 233, col: "B", text: "NOTICE (ปัญหาเเละคำเเนะนำ) สำหรับ UID" },
  { row: 236, col: "B", text: "1.หากเกิด Error 312 ให้ทำการเปิด VPN Myanmar1" },
  { row: 236, col: "K", text: "เเก้บอท>>" },
  { row: 250, col: "A", text: "2. ใช้ KBZ PAY เท่านั้น" },
];
const images = [
  { row: 1, col: 0, media: "xl/media/logo.png" },
  { row: 227, col: 11, media: "xl/media/ngn.png" },
  { row: 234, col: 4, media: "xl/media/above.png" },
  { row: 241, col: 5, media: "xl/media/error312.png" },
  { row: 251, col: 5, media: "xl/media/kbz.png" },
];
const notices = parseGameinfoSheetNotices({ cells, images });
check(notices.map((category) => category.name).join("|") === "ปัญหาและคำแนะนำ (ID-Pass)|ปัญหาและคำแนะนำ (UID)", "one category per NOTICE, named after its mode");
check(notices[0].steps.length === 1 && notices[0].steps[0].images.join() === "xl/media/ngn.png", "the picture under a note goes with it; the logo above every NOTICE is left out");
check(!JSON.stringify(notices).includes("someone@example.invalid") && !JSON.stringify(notices).includes("TESTID"), "test accounts beside a NOTICE are never read");
check(notices[1].steps.map((step) => step.description).join("|") === "1.หากเกิด Error 312 ให้ทำการเปิด VPN Myanmar1|2. ใช้ KBZ PAY เท่านั้น", "notes in order; bot links are not notes");
check(notices[1].steps[0].images.join() === "xl/media/above.png,xl/media/error312.png", "a picture above the first note goes with it");
check(notices[1].steps[1].images.join() === "xl/media/kbz.png", "each later picture goes with the last note above it");
check(JSON.stringify(countGameinfoSheetNotices(notices)) === JSON.stringify({ steps: 3, images: 4 }), "counts for the preview");
check(parseGameinfoSheetNotices({ cells: [{ row: 1, col: "A", text: "ราคาขาย" }], images }).length === 0, "no NOTICE, no notes");
const stopped = parseGameinfoSheetNotices({ cells: [
  { row: 10, col: "A", text: "NOTICE (ปัญหาเเละคำเเนะนำ)" },
  { row: 12, col: "A", text: "1. ข้อแรก" },
  { row: 14, col: "A", text: "ราคาขาย" },
  { row: 13, col: "B", text: "10000 X 2" },
  { row: 13, col: "D", text: "ข้อความในคอลัมน์ D" },
  { row: 15, col: "F", text: "60 Crystals" },
], images: [] });
check(stopped[0].steps.length === 1, "a pack table under a NOTICE ends it; quantities and cells right of C are not notes");
check(parseGameinfoSheetNotices({ cells: [{ row: 1, col: "A", text: "NOTICE (ปัญหาเเละคำเเนะนำ) สำหรับ IP-Pass" }, { row: 2, col: "A", text: "1. ข้อ" }], images: [] })[0].name === "ปัญหาและคำแนะนำ (ID-Pass)", "the sheet's spellings of ID-Pass become one");
const picturesOnly = parseGameinfoSheetNotices({ cells: [{ row: 5, col: "A", text: "NOTICE (ปัญหาเเละคำเเนะนำ)" }], images: [{ row: 7, col: 2, media: "xl/media/a.png" }] });
check(picturesOnly[0].steps[0].description === "" && picturesOnly[0].steps[0].images.length === 1, "pictures with no note still come in");

// "LIFE MAKEOVER": a pack table's NOTICE column is not a section, unnumbered
// leftovers beside numbered notes are dropped, a comparison table ends the
// notes, and a login written into a note is masked.
const makeover = parseGameinfoSheetNotices({ cells: [
  { row: 10, col: "B", text: "Pack Limit" },
  { row: 10, col: "C", text: "NOTICE" },
  { row: 11, col: "B", text: "Fashion Code" },
  { row: 30, col: "A", text: "NOTICE (ปัญหาเเละคำเเนะนำ) UID" },
  { row: 32, col: "A", text: "1. อยากให้ลองรีคอมก่อน 1 ครั้ง" },
  { row: 33, col: "A", text: "Membership" },
  { row: 34, col: "A", text: "2.เมลรับใบเสร็จ ใส่เป็น someone@example.invalid / Pass : Hero5713" },
  { row: 36, col: "A", text: "เทียบราคาแต่ละประเทศ" },
  { row: 37, col: "A", text: "3. ไม่ใช่โน้ต เป็นตารางเทียบราคา" },
], images: [] });
check(makeover.length === 1 && makeover[0].name === "ปัญหาและคำแนะนำ (UID)", "only a real NOTICE heading starts a section");
check(makeover[0].steps.map((step) => step.description.slice(0, 2)).join() === "1.,2.", "unnumbered leftovers and everything after a comparison table are dropped");
check(makeover[0].steps[1].description.endsWith("Pass : ••••") && !JSON.stringify(makeover).includes("Hero5713"), "a password in a note is masked");
check(maskGameinfoNoticeSecrets("รหัสผ่าน: abc123 ok") === "รหัสผ่าน: •••• ok", "Thai password labels are masked too");
check(maskGameinfoNoticeSecrets("1. someone@example.invalid         Pass      secret4") === "1. someone@example.invalid         Pass      ••••", "a password set apart by spaces is masked");
check(maskGameinfoNoticeSecrets("เติมผ่าน Android ID - Pass") === "เติมผ่าน Android ID - Pass", "the word Pass alone is left as it is");
const junk = parseGameinfoSheetNotices({ cells: [
  { row: 1, col: "A", text: "NOTICE (ปัญหาเเละคำเเนะนำ)" },
  { row: 2, col: "A", text: "XXXXX" },
  { row: 3, col: "A", text: "ห้ามส่งใบเสร็จทุกกรณี" },
  { row: 5, col: "A", text: "PACK" },
  { row: 6, col: "A", text: "Monthly Subscription" },
], images: [] });
check(junk[0].steps.map((step) => step.description).join() === "ห้ามส่งใบเสร็จทุกกรณี", "unnumbered notes come in; placeholders and a PACK table do not");

// A small workbook built the way Google's export lays one out, deflated.
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    chunks.push(local, nameBytes, packed);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dir, end]);
}
const workbook = readXlsxSheetsWithImages(zip({
  "xl/workbook.xml": '<workbook><sheets><sheet name="U.LOVE &amp; DEEPSPACE" sheetId="1" r:id="rId3"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId3" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>',
  "xl/sharedStrings.xml": "<sst><si><t>NOTICE (ปัญหาเเละคำเเนะนำ) UID</t></si><si><r><t>1.หากเกิด </t></r><r><t>Error 312</t></r></si></sst>",
  "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="5"><c r="B5" t="s"><v>0</v></c></row><row r="7"><c r="A7" t="s"><v>1</v></c><c r="C7"><v>42</v></c></row></sheetData></worksheet>',
  "xl/worksheets/_rels/sheet1.xml.rels": '<Relationships><Relationship Id="rId1" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>',
  "xl/drawings/drawing1.xml": '<xdr:wsDr><xdr:oneCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:pic><a:blip r:embed="rId1"/></xdr:pic></xdr:oneCellAnchor></xdr:wsDr>',
  "xl/drawings/_rels/drawing1.xml.rels": '<Relationships><Relationship Id="rId1" Type="image" Target="../media/image1.png"/></Relationships>',
  "xl/media/image1.png": "PNGBYTES",
}));
const sheet = workbook.sheets[0];
check(sheet.title === "U.LOVE & DEEPSPACE", "sheet titles are unescaped");
check(sheet.cells.map((cell) => `${cell.col}${cell.row}:${cell.text}`).join("|") === "B5:NOTICE (ปัญหาเเละคำเเนะนำ) UID|A7:1.หากเกิด Error 312", "text cells, rich text joined; numbers are not text");
check(sheet.images.length === 1 && sheet.images[0].row === 9 && sheet.images[0].col === 4 && sheet.images[0].media === "xl/media/image1.png", "a picture's anchor row is 1-based and its file resolved");
check(workbook.media("xl/media/image1.png").toString() === "PNGBYTES", "picture bytes come back inflated");
check(parseGameinfoSheetNotices(sheet)[0].steps[0].images[0] === "xl/media/image1.png", "the reader's output feeds the notice parser as is");

console.log(`gameinfo-sheet-notices: ${passed} passed`);
