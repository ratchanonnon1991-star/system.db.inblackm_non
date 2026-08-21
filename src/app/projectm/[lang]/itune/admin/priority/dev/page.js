import ItuneDevQueueSimulator from "@/components/itune-dev-queue-simulator";

export default function ItunePriorityDevPage() {
  return (
    <>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ll-ink-tertiary">
          DEV · ไม่บันทึกข้อมูล
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-ll-ink">
          จำลองการเรียงลำดับคิว
        </h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">
          สุ่มข้อมูลใน browser เพื่อดูผลการเรียงคิวเท่านั้น ไม่สร้างรายการในฐานข้อมูล
        </p>
      </div>
      <ItuneDevQueueSimulator />
    </>
  );
}
