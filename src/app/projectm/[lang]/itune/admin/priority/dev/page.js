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
      <details className="rounded-xl border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-ll-ink hover:bg-ll-surface-2">
          วิธีคำนวณ Completion Slack
        </summary>
        <div className="space-y-4 border-t border-ll-hairline px-5 pb-5 pt-4 text-[13px] leading-6 text-ll-ink-subtle">
          <p>
            Slack คือเวลาสำรองที่คาดว่าจะเหลือหลังใช้ยอดเงินหมด ยิ่งน้อยยิ่งต้องเร่งและถูกจัดไว้ก่อน
          </p>
          <div className="space-y-2 rounded-lg border border-ll-hairline bg-ll-surface-2 p-3 font-mono text-[12px] text-ll-ink">
            <p>อายุเมล = max(0, เวลาปัจจุบัน − เวลาเพิ่มเมล)</p>
            <p>เวลาที่คาดว่าใช้ = ยอดคงเหลือ ÷ อัตราใช้เงินต่อชั่วโมง</p>
            <p>Slack = ชั่วโมงเป้าหมาย − อายุเมล − เวลาที่คาดว่าใช้ − เวลารอผู้ใช้</p>
          </div>
          <div>
            <h2 className="font-semibold text-ll-ink">ตัวอย่างจากค่าเริ่มต้นของ Simulator</h2>
            <p className="font-mono text-ll-ink">24 − อายุ 5 − ($300 ÷ $50/ชม.) − เวลารอ 6 = 7 ชม.</p>
          </div>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Slack ติดลบหรือใกล้ 0 — ต้องเร่งมาก</li>
            <li>Slack ≤ 6 ชม. — แสดงป้ายเร่งด่วน แต่ไม่ใช่ชั้นคิวแยก</li>
            <li>Slack มาก — ยังมีเวลาสำรองมาก</li>
            <li>ถ้า Slack เท่ากัน: Amount มากกว่า → เพิ่มก่อน → ID น้อยกว่า</li>
          </ul>
          <p className="border-t border-ll-hairline pt-3 text-ll-ink-tertiary">
            ค่านี้เป็นค่าประมาณ ระบบไม่รู้อายุจริงก่อนเพิ่มเมล อัตราใช้จริง หรือเวลารอจริงโดยอัตโนมัติ
          </p>
        </div>
      </details>
      <ItuneDevQueueSimulator />
    </>
  );
}
