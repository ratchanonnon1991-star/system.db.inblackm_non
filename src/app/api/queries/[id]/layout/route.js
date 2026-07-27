import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findQueryById, updateQuery } from "@/server/gamedb-repository";

function sanitizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 200)
    : [];
}

// Layout shape: { order: [name], hidden: [name], labels: {name: label},
// widths: {name: px}, computed: [{ key, label, formula }] }. Cosmetic only, so
// any admin can save.
function sanitizeLayout(raw) {
  const layout = raw && typeof raw === "object" ? raw : {};
  const labels = {};
  const widths = {};
  if (layout.widths && typeof layout.widths === "object") {
    for (const [key, value] of Object.entries(layout.widths).slice(0, 200)) {
      const num = Number(value);
      if (typeof key === "string" && Number.isFinite(num) && num > 0) {
        widths[key.slice(0, 200)] = Math.round(Math.min(900, Math.max(40, num)));
      }
    }
  }
  if (layout.labels && typeof layout.labels === "object") {
    for (const [key, label] of Object.entries(layout.labels)) {
      if (typeof label === "string" && label.trim()) {
        labels[key] = label.trim().slice(0, 120);
      }
    }
  }
  const computed = Array.isArray(layout.computed)
    ? layout.computed
        .filter(
          (col) =>
            col &&
            typeof col.key === "string" &&
            typeof col.label === "string" &&
            typeof col.formula === "string"
        )
        .slice(0, 30)
        .map((col) => ({
          key: col.key.slice(0, 64),
          label: col.label.slice(0, 120),
          formula: col.formula.slice(0, 500),
        }))
    : [];
  return {
    order: sanitizeStringArray(layout.order),
    hidden: sanitizeStringArray(layout.hidden),
    labels,
    widths,
    computed,
  };
}

export async function PUT(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const existing = await findQueryById(id);
    if (!existing) return jsonError("ไม่พบ Query นี้", 404);

    const body = await request.json();
    const query = await updateQuery(id, { layout: sanitizeLayout(body.layout) });
    return jsonOk({ layout: query.layout });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถบันทึก Layout ได้");
  }
}
