import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { createRazerAccount, listRazerAccounts } from "@/server/profit-razer";
import { getRazerSyncConfig, maybeAutoSyncRazerAccount } from "@/server/profit-razer-sync";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const { searchParams } = new URL(request.url);
    const accounts = await listRazerAccounts({
      zone: searchParams.get("zone") || undefined,
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
    });
    return jsonOk({ accounts });
  } catch (err) {
    return handleApiError(err, "โหลดบัญชี Razer ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json();
    const account = await createRazerAccount(body);
    const synced = await maybeAutoSyncRazerAccount(account.id);
    return jsonOk({ account: synced?.account || account, synced: Boolean(synced) }, 201);
  } catch (err) {
    return handleApiError(err, "เพิ่มบัญชี Razer ไม่สำเร็จ");
  }
}
