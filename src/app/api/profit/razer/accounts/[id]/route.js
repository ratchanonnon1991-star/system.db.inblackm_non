import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { deleteRazerAccount, getRazerAccount, updateRazerAccount } from "@/server/profit-razer";

export async function GET(request, { params }) {
  try {
    await requireProfitAccess(request);
    const { id } = await params;
    const account = await getRazerAccount(id);
    if (!account) return handleApiError(Object.assign(new Error("ไม่พบบัญชี"), { status: 404 }));
    return jsonOk({ account });
  } catch (err) {
    return handleApiError(err, "โหลดบัญชีไม่สำเร็จ");
  }
}

export async function PATCH(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { id } = await params;
    const body = await request.json();
    const account = await updateRazerAccount(id, body);
    return jsonOk({ account });
  } catch (err) {
    return handleApiError(err, "อัปเดตบัญชีไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { id } = await params;
    await deleteRazerAccount(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบบัญชีไม่สำเร็จ");
  }
}
