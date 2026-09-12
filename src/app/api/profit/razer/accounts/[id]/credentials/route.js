import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { getRazerAccount } from "@/server/profit-razer";

export async function GET(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { id } = await params;
    const account = await getRazerAccount(id, { includeSecrets: true });
    if (!account) return handleApiError(Object.assign(new Error("ไม่พบบัญชี"), { status: 404 }));
    return jsonOk({
      credentials: {
        email: account.email,
        password: account.password,
        tfaSecret: account.tfaSecret,
      },
    });
  } catch (err) {
    return handleApiError(err, "โหลดข้อมูลลับไม่สำเร็จ");
  }
}
