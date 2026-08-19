import ItuneIssueHistory from "@/components/itune-issue-history";

export default function ItuneIssueHistoryPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ll-ink">
          ประวัติการแจ้งปัญหา
        </h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">
          ตรวจสอบปัญหาและข้อมูลรายการ ณ เวลาที่แจ้ง
        </p>
      </div>
      <ItuneIssueHistory />
    </>
  );
}
