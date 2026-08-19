import ItuneTopupLog from "@/components/itune-topup-log";

export default function ItuneTopupLogPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ll-ink">
          ผู้ถือเมลและประวัติรับ–คืน
        </h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">
          ดูผู้ถือเมลปัจจุบัน จัดการ Reject และตรวจย้อนหลัง
        </p>
      </div>
      <ItuneTopupLog />
    </>
  );
}
