import { pagedSnapshots } from "@/server/paged-snapshots";
import { prepareProfitHistory, profitHistoryPage } from "@/lib/profit-history-pagination";

// No token/user lookup is skipped: this only reuses date/order preparation after
// the authorized snapshot has been resolved. Evicted reports can be collected.
const preparedReports = new WeakMap();

export async function readProfitHistoryPage(request, actor, provider, load) {
  const params = new URL(request.url).searchParams;
  const options = Object.fromEntries(params);
  for (const key of ["fromMs", "toMs"]) if (options[key] && !Number.isFinite(Number(options[key]))) throw Object.assign(new Error("วันที่ไม่ถูกต้อง"), { status: 400 });
  const snapshot = await pagedSnapshots.resolve({ actor, scope: `profit-history:${provider}`, snapshot: params.get("snapshot"), fresh: params.get("fresh") === "1", load });
  let prepared = preparedReports.get(snapshot.value);
  if (!prepared) { prepared = prepareProfitHistory(snapshot.value); preparedReports.set(snapshot.value, prepared); }
  const result = profitHistoryPage(snapshot.value, provider, options, prepared);
  return { ...result, pagination: { ...result.pagination, snapshot: snapshot.snapshot, observedAt: snapshot.observedAt } };
}
