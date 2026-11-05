// UI composition only. Read/write authorization remains in the existing APIs.
export function workbenchGrants(user, view) {
  if (view?.isReadOnly) return { canWriteData: false, canUpdateData: false };
  if (user.role === "admin") return { canWriteData: true, canUpdateData: true };
  if (user.role === "staff") {
    const allowed = !view || view.allowStaffEdit !== false;
    return { canWriteData: allowed && Boolean(user.canWriteData), canUpdateData: allowed && Boolean(user.canUpdateData) };
  }
  const allowed = user.role === "user" && Boolean(view?.allowUserEdit);
  return { canWriteData: allowed, canUpdateData: allowed };
}

export function initialWorkbenchView(views, user, requestedId) {
  if (requestedId) return views.find((v) => Number(v.id) === Number(requestedId)) || null;
  if (user.role !== "user") return views.find((v) => v.isDefault && v.config?.panels?.length) || null;
  return views.find((v) => Number(v.id) === Number(user.defaultViewId) && v.config?.panels?.length)
    || views.find((v) => v.isDefault && v.config?.panels?.length)
    || views.find((v) => v.config?.panels?.length) || null;
}

export function queriesInView(queries, view) {
  if (!view) return queries;
  const byId = new Map(queries.map((q) => [Number(q.id), q]));
  return (view.config?.panels || []).map((p) => byId.get(Number(p.queryId))).filter(Boolean);
}

export function safeWorkbenchUrl(value) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function inspectedRow(query, columns, row, asOf) {
  const fields = columns.map((col, index) => ({
    id: col.id, label: col.label, text: String(row.cells[index]?.text ?? ""),
    // Use only columns currently exposed by this layout, including formulas.
    // Do not reveal columns hidden by a template when opening the drawer.
    links: (String(row.cells[index]?.raw ?? "").match(/https?:\/\/[^\s<>"']+/gi) || [])
      .map(safeWorkbenchUrl).filter(Boolean),
  }));
  const titleField = fields.find((f) => /^(game|เกม|ชื่อเกม|name|ชื่อ|account_name)$/i.test(f.label.trim()));
  return { queryId: query.id, queryName: query.name, sourceIndex: row.sourceIndex,
    title: titleField?.text || `รายละเอียดแถว ${row.sourceIndex + 1}`, fields,
    asOf: asOf instanceof Date ? asOf.toISOString() : null };
}

export function normalizeWorkbenchPins(value, queries) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(queries.map((q) => Number(q.id)));
  return [...new Set(value.map(Number).filter((id) => allowed.has(id)))];
}

// Saved filter data stays bounded and never participates in SQL construction.
export function normalizeColumnValueFilters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  let budget = 16000;
  return Object.fromEntries(Object.entries(value).slice(0, 30).flatMap(([key, values]) => {
    if (!key || key.length > 200 || ["__proto__", "constructor", "prototype"].includes(key) || !Array.isArray(values)) return [];
    const allowed = [...new Set(values.filter((v) => typeof v === "string" && v.length <= 500).slice(0, 100))];
    budget -= key.length + allowed.reduce((size, v) => size + v.length, 0);
    return allowed.length && budget >= 0 ? [[key, allowed]] : [];
  }));
}

export function workbenchStatusOptions(columns, rows) {
  const index = columns.findIndex((c) => /^(status|สถานะ)$/i.test(c.label?.trim() || c.column?.name || ""));
  if (index < 0) return null;
  const counts = new Map();
  for (const row of rows) {
    const text = row.cells[index]?.text;
    if (!text) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
    if (counts.size > 6) return null;
  }
  return counts.size ? { columnId: columns[index].id, options: [...counts].map(([label, count]) => ({ label, count })) } : null;
}
