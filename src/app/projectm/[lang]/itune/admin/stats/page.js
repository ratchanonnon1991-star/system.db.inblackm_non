import ItuneStatsDashboard from "@/components/itune-stats-dashboard";
import { getItuneStats } from "@/server/itune-entries-repository";

export default async function ItuneStatsPage() {
  let stats = null;
  let loadError = null;
  try {
    stats = await getItuneStats({ days: 30 });
  } catch (err) {
    loadError = err.message || "โหลดสถิติไม่สำเร็จ";
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ll-ink">สถิติและแนะนำการซื้อ</h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">ติดตามการใช้รายเมล รายคน และคำนวณจำนวนที่ควรซื้อวันนี้</p>
      </div>
      {loadError ? (
        <div className="rounded-lg border border-ll-warning/40 bg-ll-warning-bg p-6 text-sm text-ll-warning">{loadError}</div>
      ) : (
        <ItuneStatsDashboard stats={stats} />
      )}
    </>
  );
}
