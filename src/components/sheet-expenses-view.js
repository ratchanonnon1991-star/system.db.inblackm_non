import Link from "next/link";
import { Receipt } from "lucide-react";

const baht = (value) => `฿${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const monthLabel = (month) => (month ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }) : "");
const sameCategory = (a, b) => a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();

function href(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  const text = search.toString();
  return text ? `/stock/expenses?${text}` : "/stock/expenses";
}

/** 1.3 บัญชีใช้จ่ายทั่วไป: a month's money out and in, per the sheet's own categories. */
export default function SheetExpensesView({ entries, summary, month, category = "" }) {
  if (!month) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7">
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">ยังไม่มีชีต 1.3 บัญชีใช้จ่ายทั่วไป — นำเข้าชีตข้อมูลบัญชีก่อน (scripts/import-account-sheets.mjs)</div>
      </div>
    );
  }
  const current = summary.byMonth[month];
  const index = summary.months.indexOf(month);
  const previous = summary.byMonth[summary.months[index + 1]] || null;
  const spending = current.categories.filter((c) => c.out);
  const incoming = current.categories.filter((c) => c.in && !c.out);
  const picked = category ? entries.filter((entry) => sameCategory(entry.category, category)) : [];
  const tabs = [...new Set(entries.map((entry) => entry.tab))];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-7">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black"><Receipt size={22} aria-hidden="true" /> ค่าใช้จ่ายทั่วไป</h1>
        <p className="mt-1 text-sm text-zinc-600">
          จากชีต 1.3 บัญชีใช้จ่ายทั่วไป แยกตามหมวดที่กรอกไว้ในชีต (ประเภทสินค้า ใช้จ่ายบริษัท / รายการแยกย่อย) อ่านอย่างเดียว · กดชื่อหมวดเพื่อดูรายการ
        </p>
      </div>

      <div role="group" aria-label="เลือกเดือน" className="flex flex-wrap gap-1 rounded-[22px] bg-zinc-200 p-1">
        {summary.months.map((m) => (
          <Link key={m} href={href({ month: m })} aria-current={m === month ? "page" : undefined}
            className={`flex h-[38px] items-center rounded-full px-3.5 text-[13px] font-extrabold ${m === month ? "bg-[#D90005] text-white" : "text-zinc-700 hover:text-zinc-900"}`}>
            {monthLabel(m)}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
          <p className="text-xs font-extrabold">เงินออก {monthLabel(month)}</p>
          <p className="mt-1 text-2xl font-black">{baht(current.out)}</p>
          {previous ? <p className="text-xs">เดือนก่อน {baht(previous.out)}</p> : null}
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <p className="text-xs font-extrabold">เงินเข้า</p>
          <p className="mt-1 text-2xl font-black">{baht(current.in)}</p>
          {previous ? <p className="text-xs">เดือนก่อน {baht(previous.in)}</p> : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-extrabold text-zinc-500">รายการ</p>
          <p className="mt-1 text-2xl font-black">{current.count}</p>
          <p className="text-xs text-zinc-500">จากแท็บ {tabs.join(" · ")}</p>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-black">เงินออกตามหมวด</h2>
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr><th className="px-4 py-2.5">หมวด</th><th className="px-4 py-2.5">รายการแยกย่อยที่มากสุด</th><th className="px-4 py-2.5 text-right">รายการ</th><th className="px-4 py-2.5 text-right">เงินออก</th><th className="px-4 py-2.5 text-right">สัดส่วน</th></tr>
            </thead>
            <tbody>
              {spending.map((c) => (
                <tr key={c.name} className={`border-t border-zinc-100 align-top ${sameCategory(c.name, category) ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-2"><Link href={href({ month, cat: c.name })} className="font-extrabold hover:text-[#B00004] hover:underline">{c.name}</Link></td>
                  <td className="px-4 py-2 text-xs text-zinc-700">{c.details.filter((d) => d.out).slice(0, 3).map((d) => `${d.name} ${baht(d.out)}`).join(" · ")}</td>
                  <td className="px-4 py-2 text-right">{c.count}</td>
                  <td className="px-4 py-2 text-right font-extrabold">{baht(c.out)}</td>
                  <td className="px-4 py-2 text-right text-zinc-600">{current.out ? `${Math.round((c.out / current.out) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {incoming.length ? (
          <p className="text-xs text-zinc-600">เงินเข้า: {incoming.map((c) => <Link key={c.name} href={href({ month, cat: c.name })} className="mr-2 font-bold hover:underline">{c.name} {baht(c.in)}</Link>)}</p>
        ) : null}
      </section>

      {category ? (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-black">{category} <span className="text-sm font-bold text-zinc-500">({picked.length} รายการ)</span></h2>
            <Link href={href({ month })} className="text-sm font-extrabold text-[#B00004] hover:underline">ปิด</Link>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
                <tr><th className="px-4 py-2.5">วันที่</th><th className="px-4 py-2.5">รายการแยกย่อย</th><th className="px-4 py-2.5">ผู้ขาย / ผู้ทำ</th><th className="px-4 py-2.5 text-right">เงินออก</th><th className="px-4 py-2.5 text-right">เงินเข้า</th><th className="px-4 py-2.5">ในชีต</th></tr>
              </thead>
              <tbody>
                {picked.map((entry) => (
                  <tr key={`${entry.tabId}-${entry.rowNo}`} className="border-t border-zinc-100 align-top">
                    <td className="whitespace-nowrap px-4 py-2">{entry.date}{entry.time ? <span className="text-xs text-zinc-500"> {entry.time}</span> : null}</td>
                    <td className="px-4 py-2">{entry.detail || "—"}{entry.note ? <p className="text-xs text-zinc-500">{entry.note}</p> : null}</td>
                    <td className="px-4 py-2 text-xs text-zinc-700">{[entry.seller, entry.buyer].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-2 text-right font-extrabold">{entry.out ? baht(entry.out) : ""}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{entry.in ? baht(entry.in) : ""}</td>
                    <td className="px-4 py-2"><Link href={`/stock/sheets?tab=${entry.tabId}&row=${entry.rowNo}`} className="whitespace-nowrap text-xs font-bold text-[#B00004] hover:underline">{entry.tab} แถว {entry.rowNo}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
