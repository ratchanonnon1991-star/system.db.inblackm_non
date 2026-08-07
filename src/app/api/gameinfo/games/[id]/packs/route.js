import { handleApiError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer";
import { saveGameinfoPacks } from "@/server/gameinfo-games";

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const game = await saveGameinfoPacks(Number(id), {
      currencies: Array.isArray(body.currencies) ? body.currencies : [],
      computedColumns: sanitizeComputedColumns(body.computedColumns),
    });
    return jsonOk({ game });
  } catch (err) {
    return handleApiError(err, "บันทึกตารางแพ็กไม่สำเร็จ");
  }
}
