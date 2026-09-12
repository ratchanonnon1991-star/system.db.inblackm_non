import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { importRazerAccountsFromCsv } from "@/server/profit-razer";
import { getRazerSyncConfig, maybeAutoSyncRazerAccount } from "@/server/profit-razer-sync";

export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json();
    const result = await importRazerAccountsFromCsv(body.csv);
    const { autoSync, enabled } = getRazerSyncConfig();
    const sync = { ok: 0, failed: 0, skipped: !autoSync || !enabled };

    if (autoSync && enabled) {
      for (const id of result.accountIds || []) {
        const synced = await maybeAutoSyncRazerAccount(id);
        if (synced) sync.ok += 1;
        else sync.failed += 1;
      }
    }

    return jsonOk({ result: { ...result, sync } });
  } catch (err) {
    return handleApiError(err, "นำเข้า CSV ไม่สำเร็จ");
  }
}
