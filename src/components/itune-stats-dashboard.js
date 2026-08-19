function money(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function hours(value) {
  return Number(value || 0).toFixed(1) + " ชม.";
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ll-ink-tertiary">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ll-ink">{value}</p>
      <p className="mt-1 text-[11px] text-ll-ink-subtle">{detail}</p>
    </div>
  );
}

export default function ItuneStatsDashboard({ stats }) {
  const { overview, purchase, daily, users, bands, periodDays } = stats;
  const dailyMax = Math.max(1, ...daily.map((row) => row.amountUsed));
  const userMax = Math.max(1, ...users.map((row) => row.amountUsed));

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ใช้วันนี้" value={"$" + money(overview.usedToday)} detail={overview.sessionsToday + " sessions"} />
        <StatCard label="Stock ใช้ได้" value={"$" + money(overview.usableStock)} detail={overview.queueCount + " เมล · พอ " + hours(overview.hoursOfCover)} />
        <StatCard label="กำลังถือ" value={"$" + money(overview.heldStock)} detail={overview.heldCount + " เมล"} />
        <StatCard label="เพิ่มวันนี้" value={overview.emailsAddedToday} detail={"หมด " + overview.depletedToday + " · คืนต่อ " + overview.partialToday + " · เสีย " + overview.unusableToday} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ll-ink-tertiary">คำแนะนำซื้อวันนี้</p>
          <div className="mt-3 flex flex-wrap items-end gap-5">
            <div>
              <p className="text-3xl font-semibold tracking-[-0.05em] text-ll-ink">{purchase.recommendedEmailCount} เมล</p>
              <p className="mt-1 text-[12px] text-ll-ink-subtle">
                {"ประมาณ $" + money(purchase.recommendedDailyAmount) + " ที่ยอดเฉลี่ย $" + money(purchase.preferredAmountPerEmail)}
              </p>
            </div>
            <span className="rounded-full bg-ll-warning-bg px-3 py-1 text-[11px] font-medium text-ll-warning">ซื้อให้เสร็จก่อน 18:00</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-ll-hairline pt-4 text-[12px]">
            {[["Demand P75", purchase.demandP75], ["Demand P90", purchase.demandP90], ["Safety stock", purchase.safetyStock]].map(([label, value]) => (
              <div key={label}><p className="text-ll-ink-tertiary">{label}</p><p className="mt-1 font-semibold text-ll-ink">{"$" + money(value)}</p></div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-5 text-ll-ink-tertiary">คำแนะนำจะเริ่มแม่นขึ้นหลังมี session จริงหลายวัน และคำนวณใหม่จาก P75/P90 อัตโนมัติ</p>
        </div>

        <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ll-ink-tertiary">เวลาถือต่อ Session</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[["P50", overview.holdP50], ["P75", overview.holdP75], ["P90", overview.holdP90]].map(([label, value]) => (
              <div key={label} className="rounded-md bg-ll-surface-2 p-3"><p className="text-[11px] text-ll-ink-tertiary">{label}</p><p className="mt-1 text-lg font-semibold text-ll-ink">{hours(value)}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-5">
        <h2 className="text-sm font-semibold text-ll-ink">ยอดใช้รายวัน</h2>
        <p className="mt-1 text-[11px] text-ll-ink-subtle">ย้อนหลัง {periodDays} วัน · USD ที่ลดลงจาก session</p>
        {daily.length === 0 ? (
          <p className="py-12 text-center text-[12px] text-ll-ink-tertiary">ยังไม่มี session ที่จบแล้ว</p>
        ) : (
          <div className="mt-5 flex h-52 items-end gap-1 overflow-x-auto border-b border-ll-hairline pb-1">
            {daily.map((row) => (
              <div key={String(row.day)} className="group flex min-w-8 flex-1 flex-col items-center justify-end gap-1" title={new Date(row.day).toLocaleDateString("th-TH") + ": $" + money(row.amountUsed)}>
                <span className="text-[9px] text-ll-ink-tertiary opacity-0 group-hover:opacity-100">{Math.round(row.amountUsed)}</span>
                <div className="w-full max-w-10 rounded-t-sm bg-ll-primary" style={{ height: Math.max(3, (row.amountUsed / dailyMax) * 165) + "px" }} />
                <span className="text-[9px] text-ll-ink-tertiary">{new Date(row.day).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-5">
          <h2 className="text-sm font-semibold text-ll-ink">การใช้รายคน</h2>
          <div className="mt-4 space-y-3">
            {users.length === 0 && <p className="text-[12px] text-ll-ink-tertiary">ยังไม่มีข้อมูล</p>}
            {users.map((user) => (
              <div key={user.username}>
                <div className="flex justify-between gap-3 text-[11px]"><span className="truncate font-medium text-ll-ink">{user.username}</span><span className="shrink-0 text-ll-ink-subtle">{"$" + money(user.amountUsed) + " · " + user.sessions + " ครั้ง · " + hours(user.avgHoldHours)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ll-surface-2"><div className="h-full rounded-full bg-ll-primary" style={{ width: (user.amountUsed / userMax) * 100 + "%" }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-5">
          <h2 className="text-sm font-semibold text-ll-ink">เปรียบเทียบช่วง Amount</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-ll-ink-tertiary"><tr><th className="py-2">ช่วง</th><th className="py-2 text-right">Sessions</th><th className="py-2 text-right">ใช้หมด</th><th className="py-2 text-right">เวลาเฉลี่ย</th><th className="py-2 text-right">ยอดใช้</th></tr></thead>
              <tbody>{bands.map((band) => (
                <tr key={band.band} className="border-t border-ll-hairline"><td className="py-2.5 font-medium text-ll-ink">{band.band}</td><td className="py-2.5 text-right text-ll-ink-subtle">{band.sessions}</td><td className="py-2.5 text-right text-ll-ink-subtle">{band.depletedCount}</td><td className="py-2.5 text-right text-ll-ink-subtle">{hours(band.avgHoldHours)}</td><td className="py-2.5 text-right font-medium text-ll-ink">{"$" + money(band.amountUsed)}</td></tr>
              ))}</tbody>
            </table>
            {bands.length === 0 && <p className="py-8 text-center text-[12px] text-ll-ink-tertiary">ยังไม่มีข้อมูล</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
