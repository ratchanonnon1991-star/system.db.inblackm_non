import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { findItuneEntryById, setItuneEntryPermanent } from "@/server/itune-entries-repository";

// "ตั้งเป็นเมลถาวร" / "ตั้งกลับเป็นเมลปกติ" (see the "⋮" row menu in
// itune-admin-table.js) — admin-only, same gate as report/resolve.
export async function PUT(request, { params }) {
  try {
    const actor = await requireProjectmAdmin(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const body = await request.json();
    const entry = await setItuneEntryPermanent(id, Boolean(body.isPermanent), actor);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "เปลี่ยนสถานะไม่สำเร็จ");
  }
}
