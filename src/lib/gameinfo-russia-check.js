export const RUSSIA_CHECK_PAGE_SIZE = 50;
export const RUSSIA_CHECK_STATUSES = new Set(["active", "pending_removal", "removed"]);

export function normalizeRussiaCheckName(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeRussiaCheckCatalog(items) {
  if (!Array.isArray(items)) throw new Error("รูปแบบรายการ Pack จาก Xsolla ไม่ถูกต้อง");
  const seen = new Set();
  const normalized = [];
  for (const item of items) {
    if (item?.can_be_bought === false) continue;
    const sku = String(item?.sku ?? "").trim();
    const name = normalizeRussiaCheckName(item?.name);
    if (!sku || !name) throw new Error("Xsolla ส่ง Pack ที่ไม่มี SKU หรือชื่อ");
    if (seen.has(sku)) throw new Error(`Xsolla ส่ง SKU ซ้ำ: ${sku}`);
    seen.add(sku);
    normalized.push({ sku, name });
  }
  if (!normalized.length) throw new Error("Xsolla ส่งรายการ Pack ว่าง");
  return normalized.sort((a, b) => a.sku.localeCompare(b.sku));
}

export function reconcileRussiaCheckCatalog(existing, incoming, { baseline = false } = {}) {
  const currentBySku = new Map((existing || []).map((item) => [String(item.sku), item]));
  const incomingBySku = new Map((incoming || []).map((item) => [String(item.sku), item]));
  const items = [];
  const events = [];

  for (const pack of incoming || []) {
    const current = currentBySku.get(pack.sku);
    if (!current) {
      items.push({ ...pack, status: "active", missingRuns: 0, baseline });
      events.push({ kind: "added", sku: pack.sku, name: pack.name });
      continue;
    }
    const restored = current.status === "removed";
    items.push({
      ...current,
      name: pack.name,
      status: "active",
      missingRuns: 0,
      restored,
    });
    if (restored) events.push({ kind: "restored", sku: pack.sku, name: pack.name });
  }

  for (const current of existing || []) {
    if (incomingBySku.has(String(current.sku))) continue;
    if (current.status === "removed") {
      items.push({ ...current, status: "removed" });
      continue;
    }
    const missingRuns = Number(current.missingRuns || current.missing_runs || 0) + 1;
    const removed = missingRuns >= 2;
    items.push({ ...current, missingRuns, status: removed ? "removed" : "pending_removal" });
    if (removed) events.push({ kind: "removed", sku: String(current.sku), name: current.name });
  }

  return { items, events };
}

export function nextRussiaCheckRunAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(2, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
