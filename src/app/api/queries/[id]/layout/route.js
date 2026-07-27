import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findQueryById, updateQuery } from "@/server/gamedb-repository";
import {
  PARAM_TYPES,
  REFRESH_CHOICES,
  RULE_OPS,
  RULE_TONES,
  SUMMARY_KINDS,
} from "@/lib/gamedb-layout";
import { isSafeIdentifier, isSafeIdentifierPart } from "@/lib/gamedb-identifier";

function sanitizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 200)
    : [];
}

// Layout shape: { order, hidden, labels, widths, computed, params, editable,
// rules, summary, chart, sort, refreshSeconds }. Everything here is display
// configuration a signed-in user may change, except `editable`, which decides
// which table rows the edit endpoint will write to and is therefore checked
// again — and restricted to admins — over there.
function sanitizeLayout(raw) {
  const layout = raw && typeof raw === "object" ? raw : {};
  const labels = {};
  const widths = {};
  const summary = {};
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
  if (layout.summary && typeof layout.summary === "object") {
    for (const [key, kind] of Object.entries(layout.summary).slice(0, 200)) {
      if (SUMMARY_KINDS.includes(kind)) summary[String(key).slice(0, 200)] = kind;
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
  const params = Array.isArray(layout.params)
    ? layout.params
        .filter((param) => param && /^[A-Za-z_][A-Za-z0-9_]*$/.test(param.name || ""))
        .slice(0, 20)
        .map((param) => ({
          name: String(param.name),
          label: String(param.label || param.name).slice(0, 120),
          type: PARAM_TYPES.includes(param.type) ? param.type : "text",
          defaultValue: String(param.defaultValue ?? "").slice(0, 200),
          options: sanitizeStringArray(param.options)
            .slice(0, 100)
            .map((option) => option.slice(0, 200)),
        }))
    : [];
  const rules = Array.isArray(layout.rules)
    ? layout.rules
        .filter(
          (rule) =>
            rule &&
            typeof rule.colId === "string" &&
            RULE_OPS.includes(rule.op) &&
            RULE_TONES.includes(rule.tone)
        )
        .slice(0, 40)
        .map((rule) => ({
          colId: rule.colId.slice(0, 200),
          op: rule.op,
          value: String(rule.value ?? "").slice(0, 120),
          tone: rule.tone,
        }))
    : [];
  const editable =
    layout.editable &&
    typeof layout.editable === "object" &&
    isSafeIdentifier(String(layout.editable.table || "")) &&
    isSafeIdentifierPart(String(layout.editable.pk || ""))
      ? {
          table: String(layout.editable.table),
          pk: String(layout.editable.pk),
          columns: sanitizeStringArray(layout.editable.columns)
            .filter(isSafeIdentifierPart)
            .slice(0, 50),
        }
      : null;
  const chart =
    layout.chart && typeof layout.chart === "object" && layout.chart.x
      ? {
          type: layout.chart.type === "line" ? "line" : "bar",
          x: String(layout.chart.x).slice(0, 200),
          y: sanitizeStringArray(layout.chart.y).slice(0, 6),
        }
      : null;
  const sort =
    layout.sort && typeof layout.sort === "object" && layout.sort.colId
      ? {
          colId: String(layout.sort.colId).slice(0, 200),
          dir: layout.sort.dir === "desc" ? "desc" : "asc",
        }
      : null;

  return {
    order: sanitizeStringArray(layout.order),
    hidden: sanitizeStringArray(layout.hidden),
    labels,
    widths,
    computed,
    params,
    editable,
    rules,
    summary,
    chart,
    sort,
    refreshSeconds: REFRESH_CHOICES.includes(Number(layout.refreshSeconds))
      ? Number(layout.refreshSeconds)
      : 0,
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
