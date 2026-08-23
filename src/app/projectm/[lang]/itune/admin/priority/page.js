import {
  getItuneClaimSettings,
  listItunePriorityQueue,
} from "@/server/itune-entries-repository";
import ItunePriorityTable from "@/components/itune-priority-table";

export default async function ItunePriorityPage() {
  let entries = null;
  let settings = null;
  let loadError = null;
  try {
    [entries, settings] = await Promise.all([
      listItunePriorityQueue(),
      getItuneClaimSettings(),
    ]);
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ll-ink">จัดคิวรับเมล</h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">
          จัดลำดับคิวและควบคุมการเปิดรับเมล
        </p>
      </div>
      {loadError ? (
        <div className="rounded-lg border border-ll-warning/40 bg-ll-warning-bg p-6 text-sm text-ll-warning">
          {loadError}
        </div>
      ) : (
        <ItunePriorityTable initialEntries={entries} initialSettings={settings} />
      )}
    </>
  );
}
