import { requireProjectmAccess } from "@/server/auth";
import { handleApiError, jsonOk } from "@/lib/http";
import { addBalancePhoto, listBalancePhotos } from "@/server/itune-sheet-orders";

// Admins: any email. Topup: only the email they hold (checked in the repository).
export async function GET(request) {
  try {
    const actor = await requireProjectmAccess(request);
    const entryId = new URL(request.url).searchParams.get("entryId");
    const response = jsonOk(await listBalancePhotos(entryId, actor)); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (err) { return handleApiError(err, "โหลดรูปยอดคงเหลือไม่สำเร็จ"); }
}

export async function POST(request) {
  try {
    const actor = await requireProjectmAccess(request);
    const body = await request.json().catch(() => ({}));
    return jsonOk(await addBalancePhoto(body, actor), 201);
  } catch (err) { return handleApiError(err, "บันทึกรูปยอดคงเหลือไม่สำเร็จ"); }
}
