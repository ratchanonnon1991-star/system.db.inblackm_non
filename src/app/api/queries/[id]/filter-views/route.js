import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import { insertFilterView, listFilterViews } from "@/server/gamedb-filter-views-repository";

const MAX_NAME_LENGTH = 120;
const MAX_ROW_FILTER_LENGTH = 500;

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const queryId = Number(id);
    if (!Number.isInteger(queryId) || queryId <= 0) return jsonError("Query ไม่ถูกต้อง", 400);
    const filterViews = await listFilterViews(queryId);
    return jsonOk({ filterViews });
  } catch (err) {
    return handleApiError(err, "โหลดชุดตัวกรองไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await params;
    const queryId = Number(id);
    if (!Number.isInteger(queryId) || queryId <= 0) return jsonError("Query ไม่ถูกต้อง", 400);
    const query = await findQueryById(queryId);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const body = await request.json();
    const name = String(body.name || "").trim().slice(0, MAX_NAME_LENGTH);
    if (!name) return jsonError("กรุณาตั้งชื่อชุดตัวกรอง", 400);

    const lookupRowFilter =
      body.lookupRowFilter &&
      typeof body.lookupRowFilter === "object" &&
      typeof body.lookupRowFilter.lookupId === "string" &&
      typeof body.lookupRowFilter.matched === "boolean"
        ? { lookupId: body.lookupRowFilter.lookupId, matched: body.lookupRowFilter.matched }
        : null;

    const paramValues =
      body.paramValues && typeof body.paramValues === "object" && !Array.isArray(body.paramValues)
        ? Object.fromEntries(
            Object.entries(body.paramValues)
              .slice(0, 50)
              .map(([key, value]) => [String(key).slice(0, 200), String(value ?? "").slice(0, 2000)])
          )
        : {};

    const filterView = await insertFilterView({
      queryId,
      name,
      rowFilter: String(body.rowFilter || "").slice(0, MAX_ROW_FILTER_LENGTH),
      lookupRowFilter,
      paramValues,
      createdBy: admin.username || admin.displayName || "",
    });
    return jsonOk({ filterView }, 201);
  } catch (err) {
    return handleApiError(err, "บันทึกชุดตัวกรองไม่สำเร็จ");
  }
}
