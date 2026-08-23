const FIELD_LABELS = {
  name: "ชื่อ", game: "ชื่อเกม", image: "รูป", price: "ราคาขาย",
  amountChargedFee: "ยอดที่กดรวม fee", serviceEnabled: "เปิดให้บริการ",
  serviceStatus: "สถานะบริการ", costProfileId: "โปรไฟล์ต้นทุน",
  channelsMain: "ช่องทางหลัก", channelsSecondary: "ช่องทางสำรอง",
  country: "ประเทศ", currencyName: "ชื่อสกุลเงิน", currencyImage: "รูปสกุลเงิน",
  categoryName: "ชื่อหมวดหมู่", region: "Region", platform: "Platform",
  server: "Server", botManual: "Bot/Manual", vpn: "VPN", channel: "ช่องทาง",
  link: "ลิงก์", remark: "หมายเหตุ", rankStars: "Rank", isRepeatable: "ทำซ้ำได้",
  enabled: "เปิดใช้งาน", categories: "หมวดหมู่", links: "ลิงก์",
  variables: "ตัวแปร", computedColumns: "คอลัมน์สูตร", costProfiles: "โปรไฟล์ต้นทุน",
  packCount: "จำนวน Pack", tags: "Tags", publishers: "ค่ายเกม", language: "ภาษา",
};

const HIDDEN_FIELDS = new Set([
  "id", "currencyId", "categoryId", "sourcePackId", "updatedAt", "updatedBy", "createdAt",
  "currencyOrder", "categoryOrder", "packOrder",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function sameValue(a, b) {
  return JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
}

export function formatAuditValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่";
  if (Array.isArray(value)) {
    if (!value.length) return "ว่าง";
    return value.every((item) => item == null || typeof item !== "object")
      ? value.join(", ")
      : `${value.length} รายการ`;
  }
  if (typeof value === "object") return Object.keys(value).length ? `${Object.keys(value).length} รายการ` : "ว่าง";
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function summarizeGameinfoAudit(entry) {
  const before = entry?.before ?? null;
  const after = entry?.after ?? null;
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  if (!object(before) && !object(after)) return [];
  const fields = new Set([...Object.keys(object(before) ? before : {}), ...Object.keys(object(after) ? after : {})]);
  return [...fields]
    .filter((field) => !HIDDEN_FIELDS.has(field) && !sameValue(before?.[field], after?.[field]))
    .map((field) => ({ field, label: FIELD_LABELS[field] || field, from: before?.[field], to: after?.[field] }))
    .sort((a, b) => a.field === "name" ? -1 : b.field === "name" ? 1 : a.field.localeCompare(b.field));
}
