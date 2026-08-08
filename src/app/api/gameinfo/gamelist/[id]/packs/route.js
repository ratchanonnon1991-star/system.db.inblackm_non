import { handleApiError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer";
import { saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const packs = await saveGamelistPacks(Number(id), {
      currencies: Array.isArray(body.currencies) ? body.currencies : [],
      computedColumns: sanitizeComputedColumns(body.computedColumns),
    });
    return jsonOk({ game: { id: Number(id), ...packs } });
  } catch (err) {
    return handleApiError(err, "บันทึกตารางแพ็กไม่สำเร็จ");
  }
}
