import ItuneHistory from "@/components/itune-history";

export default function ItuneIssueHistoryPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ll-ink">
          ประวัติ iTune
        </h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">
          ตรวจสอบการรับ–คืน ยอด ปัญหา การแก้ข้อมูล คิว และกิจกรรมแอดมิน
        </p>
      </div>
      <ItuneHistory />
    </>
  );
}
