import Link from "next/link";
import { CreditCard, Search } from "lucide-react";

const usdt = (value) => `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`;
const monthLabel = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "UTC" });
const SHOWN = 150;

function href(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  const text = search.toString();
  return text ? `/stock/offgamer?${text}` : "/stock/offgamer";
}

/** 1.4 Multi Game Card: the cards bought on OffGamer. Serials only; the PIN is never stored. */
export default function OffgamerCardsView({ orders, summary, accounts, listTabId, account = "", month = "", query = "" }) {
  if (!orders.length) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7">
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">ยังไม่มีชีต 1.4 Multi Game Card — นำเข้าชีตข้อมูลบัญชีก่อน (scripts/import-account-sheets.mjs)</div>
      </div>
    );
  }
  const needle = query.toLowerCase();
  const shown = orders.filter((order) => (!account || order.account.toLowerCase() === account.toLowerCase())
    && (!month || order.date.startsWith(month))
    && (!needle || [order.order, order.buyer, order.account, ...order.cards.map((card) => card.serial)].join(" ").toLowerCase().includes(needle)));
  const shownCards = shown.reduce((sum, order) => sum + order.cards.length, 0);
  const shownSpent = shown.reduce((sum, order) => sum + order.spent, 0);
  const listed = new Map(accounts.map((row) => [row.owner.replace(/'/g, "").toLowerCase(), row]));
  const filtered = account || month || query;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-7">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black"><CreditCard size={22} aria-hidden="true" /> Multi Game Card (OffGamer)</h1>
        <p className="mt-1 text-sm text-zinc-600">
          บัตร MOL Multi Game Card ที่ซื้อจาก OffGamer ตามชีต 1.4 แยกตามบัญชี OffGamer อ่านอย่างเดียว · เก็บแค่ Serial มูลค่า และเลขออเดอร์ ไม่เก็บ PIN (ดู PIN ในชีตต้นฉบับ)
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-extrabold text-zinc-500">ออเดอร์ทั้งหมด</p><p className="mt-1 text-2xl font-black">{summary.totals.orders.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-extrabold text-zinc-500">บัตร</p><p className="mt-1 text-2xl font-black">{summary.totals.cards.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-extrabold text-zinc-500">USDT ที่เติมเข้า</p><p className="mt-1 text-2xl font-black">{usdt(summary.totals.received)}</p></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-extrabold text-zinc-500">USDT ที่ใช้ซื้อบัตร</p><p className="mt-1 text-2xl font-black">{usdt(summary.totals.spent)}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-black">ตามบัญชี OffGamer</h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
                <tr><th className="px-4 py-2.5">บัญชี</th><th className="px-4 py-2.5">แรงค์ / หมายเหตุ</th><th className="px-4 py-2.5 text-right">ออเดอร์</th><th className="px-4 py-2.5 text-right">บัตร</th><th className="px-4 py-2.5 text-right">USDT</th><th className="px-4 py-2.5">ล่าสุด</th></tr>
              </thead>
              <tbody>
                {summary.accounts.map((row) => {
                  const info = listed.get(row.account.replace(/'/g, "").toLowerCase());
                  return (
                    <tr key={row.account} className={`border-t border-zinc-100 ${row.account.toLowerCase() === account.toLowerCase() ? "bg-amber-50" : ""}`}>
                      <td className="px-4 py-2"><Link href={href({ account: row.account, month })} className="font-extrabold hover:text-[#B00004] hover:underline">{row.account}</Link></td>
                      <td className="px-4 py-2 text-xs text-zinc-700">{info ? [info.rank, info.notice].filter(Boolean).join(" · ") : "—"}</td>
                      <td className="px-4 py-2 text-right">{row.orders}</td>
                      <td className="px-4 py-2 text-right">{row.cards}</td>
                      <td className="px-4 py-2 text-right font-extrabold">{usdt(row.spent)}</td>
                      <td className="px-4 py-2 text-xs text-zinc-600">{row.lastDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {listTabId ? <Link href={`/stock/sheets?tab=${listTabId}`} className="text-xs font-bold text-[#B00004] hover:underline">เปิดแท็บ Offgamer List (รายชื่อบัญชี ตารางวันใช้งาน)</Link> : null}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-black">ตามเดือน</h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
                <tr><th className="px-4 py-2.5">เดือน</th><th className="px-4 py-2.5 text-right">บัตร</th><th className="px-4 py-2.5 text-right">USDT</th></tr>
              </thead>
              <tbody>
                {summary.months.map((row) => (
                  <tr key={row.month} className={`border-t border-zinc-100 ${row.month === month ? "bg-amber-50" : ""}`}>
                    <td className="px-4 py-2"><Link href={href({ account, month: row.month })} className="font-extrabold hover:text-[#B00004] hover:underline">{monthLabel(row.month)}</Link></td>
                    <td className="px-4 py-2 text-right">{row.cards}</td>
                    <td className="px-4 py-2 text-right font-extrabold">{usdt(row.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <form action="/stock/offgamer" className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
          {account ? <input type="hidden" name="account" value={account} /> : null}
          {month ? <input type="hidden" name="month" value={month} /> : null}
          <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-zinc-300 px-3">
            <Search size={14} className="text-zinc-400" aria-hidden="true" />
            <input name="q" defaultValue={query} placeholder="ค้นเลขออเดอร์ Serial หรือผู้สั่งซื้อ" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <button className="h-10 rounded-xl bg-[#D90005] px-4 text-sm font-extrabold text-white hover:bg-[#B00004]">ค้นหา</button>
          {filtered ? <Link href="/stock/offgamer" className="text-sm font-extrabold text-[#B00004] hover:underline">ล้างตัวกรอง</Link> : null}
        </form>
        <h2 className="text-base font-black">
          ออเดอร์{account ? ` · ${account}` : ""}{month ? ` · ${monthLabel(month)}` : ""}
          <span className="text-sm font-bold text-zinc-500"> ({shown.length} ออเดอร์ · {shownCards} บัตร · {usdt(shownSpent)})</span>
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr><th className="px-4 py-2.5">วันที่</th><th className="px-4 py-2.5">ออเดอร์ OffGamer</th><th className="px-4 py-2.5">บัญชี / ผู้สั่งซื้อ</th><th className="px-4 py-2.5">บัตร (Serial)</th><th className="px-4 py-2.5 text-right">USDT</th><th className="px-4 py-2.5">ในชีต</th></tr>
            </thead>
            <tbody>
              {shown.slice(0, SHOWN).map((order) => {
                const values = [...new Set(order.cards.map((card) => card.usdt))];
                return (
                  <tr key={`${order.account}-${order.key}`} className="border-t border-zinc-100 align-top">
                    <td className="whitespace-nowrap px-4 py-2">{order.date}</td>
                    <td className="px-4 py-2 font-extrabold">{order.order || <span className="font-normal text-zinc-400">ชีตไม่ได้ใส่เลข</span>}</td>
                    <td className="px-4 py-2">{order.account}<p className="text-xs text-zinc-500">{order.buyer || "—"}</p></td>
                    <td className="px-4 py-2">
                      <p className="font-bold">{order.cards.length} ใบ{values.length === 1 ? ` × ${usdt(values[0])}` : ""}</p>
                      <details className="text-xs text-zinc-600">
                        <summary className="cursor-pointer select-none">ดู Serial</summary>
                        <ul className="mt-1 font-mono">{order.cards.map((card) => <li key={card.rowNo}>{card.serial || "—"}{values.length > 1 ? ` · ${usdt(card.usdt)}` : ""}{card.expiry ? ` · หมดอายุ ${card.expiry}` : ""}</li>)}</ul>
                      </details>
                    </td>
                    <td className="px-4 py-2 text-right font-extrabold">{usdt(order.spent)}{order.received && Math.abs(order.received - order.spent) > 0.01 ? <p className="text-xs font-bold text-amber-700">เติมเข้า {usdt(order.received)}</p> : null}</td>
                    <td className="px-4 py-2"><Link href={`/stock/sheets?tab=${order.tabId}&row=${order.rowNo}`} className="whitespace-nowrap text-xs font-bold text-[#B00004] hover:underline">แถว {order.rowNo}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length > SHOWN ? <p className="text-xs text-zinc-600">แสดง {SHOWN} ออเดอร์ล่าสุดจาก {shown.length} · เลือกบัญชีหรือเดือนเพื่อดูส่วนที่เหลือ</p> : null}
      </section>
    </div>
  );
}
