export const GAMEINFO_STATUSES = [
  { id: "all", label: "เกมทั้งหมด" },
  { id: "online", label: "พร้อมใช้งาน" },
  { id: "review", label: "ต้องตรวจสอบ" },
  { id: "partial", label: "เปิดบางส่วน" },
  { id: "offline", label: "ปิดใช้งาน" },
];

export function summarizeGameinfoRows(rows) {
  return rows.reduce(
    (counts, row) => {
      counts.all += 1;
      counts[row.serviceStatus || "online"] += 1;
      if (row.reportCount > 0) counts.review += 1;
      if (isGameinfoBotAuto(row.botManual)) counts.botAuto += 1;
      if (row.isFavorite) counts.favorite += 1;
      return counts;
    },
    { all: 0, online: 0, review: 0, partial: 0, offline: 0, botAuto: 0, favorite: 0 }
  );
}

export function isGameinfoBotAuto(value) {
  const normalized = String(value ?? "").toLocaleLowerCase("en").replace(/[^a-z]/g, "");
  return normalized === "bot" || normalized === "botauto";
}

function listGameinfoValues(rows, field) {
  const tags = new Map();
  for (const row of rows) {
    for (const tag of row[field] || []) {
      const key = tag.toLocaleLowerCase("th");
      const current = tags.get(key);
      tags.set(key, { name: current?.name || tag, count: (current?.count || 0) + 1 });
    }
  }
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export function listGameinfoTags(rows) {
  return listGameinfoValues(rows, "tags");
}

export function listGameinfoPublishers(rows) {
  return listGameinfoValues(rows, "publishers");
}

export function filterGameinfoRows(rows, { query = "", status = "all", tag = "", publisher = "", sort = "order" } = {}) {
  const needle = query.trim().toLocaleLowerCase("th");
  const filtered = rows.filter((row) => {
    if (status === "review" && !(row.reportCount > 0)) return false;
    if (status === "bot-auto" && !isGameinfoBotAuto(row.botManual)) return false;
    if (status === "favorite" && !row.isFavorite) return false;
    if (status !== "all" && status !== "review" && status !== "bot-auto" && status !== "favorite" && row.serviceStatus !== status) return false;
    if (tag && !(row.tags || []).some((value) => value.toLocaleLowerCase("th") === tag.toLocaleLowerCase("th"))) return false;
    if (publisher && !(row.publishers || []).some((value) => value.toLocaleLowerCase("th") === publisher.toLocaleLowerCase("th"))) return false;
    if (!needle) return true;
    return [row.game, row.id, row.region, row.platform, row.server, row.vpnComputed, ...(row.tags || []), ...(row.publishers || [])]
      .some((value) => String(value ?? "").toLocaleLowerCase("th").includes(needle));
  });
  if (sort === "name") return [...filtered].sort((a, b) => String(a.game).localeCompare(String(b.game), "th"));
  if (sort === "latest") return [...filtered].sort((a, b) => Number(b.id) - Number(a.id));
  return filtered;
}
