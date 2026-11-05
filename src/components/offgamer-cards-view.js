import Link from "next/link";
import { ArrowRight, CreditCard, Search } from "lucide-react";
import { offgamerOrderId, orderBotUse, PAYMENT_DAYS } from "@/lib/offgamer-cards";

const points = (value) => (value == null ? "ไม่ทราบแต้ม" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} แต้ม`);
const dateTime = (value) => (value ? new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—");
const usdt = (value) => `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`;
const monthLabel = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "UTC" });
const SHOWN = 150;

function href(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  const text = search.toString();
  return text ? `/stock/offgamer?${text}` : "/stock/offgamer";
}

/** 1.4 Multi Game Card: the cards bought on OffGamer. Serials only; the PIN is never stored. */
/** One card opened: which OffGamer order bought it, what funded that order, and the bot orders it paid for. */
function CardTrail({ serial, orders, payments, botUse, serialOrders, back }) {
  const order = orders.find((o) => o.cards.some((card) => card.serial === serial));
  const card = order?.cards.find((c) => c.serial === serial);
  const payment = order ? payments[offgamerOrderId(order)] : null;
  const use = botUse[serial];
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-black">เส้นทางบัตร <span className="font-mono">{serial}</span></h2>
        <Link href={back} className="text-sm font-extrabold text-[#B00004] hover:underline">ปิด</Link>
      </div>
      <ol className="mt-3 grid gap-2 text-sm md:grid-cols-3">
        <li className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-extrabold text-zinc-500">1. เงินมาจาก</p>
          {payment ? (
            <p className="mt-1"><Link href={`/stock/wallets?entry=${payment.id}`} className="font-extrabold text-[#B00004] hover:underline">{payment.walletName} · {usdt(payment.amount)}</Link><br /><span className="text-xs text-zinc-600">{payment.date}{payment.fee ? ` · ค่าธรรมเนียม ${usdt(payment.fee)}` : ""} · เปิดเพื่อดูว่าเงินก้อนนี้โอนมาจากไหน</span></p>
          ) : <p className="mt-1 text-zinc-600">ยังหาการจ่ายที่ตรงกันในกระเป๋าเงินไม่เจอ</p>}
        </li>
        <li className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-extrabold text-zinc-500">2. ซื้อบัตรที่ OffGamer</p>
          {order ? (
            <p className="mt-1"><span className="font-extrabold">{order.account}</span> · ออเดอร์ {order.order || "(ชีตไม่ได้ใส่เลข)"}<br /><span className="text-xs text-zinc-600">{order.date} · {order.buyer || "—"} · ใบนี้ {usdt(card?.usdt)}{card?.expiry ? ` · หมดอายุ ${card.expiry}` : ""} · </span><Link href={`/stock/sheets?tab=${order.tabId}&row=${card?.rowNo || order.rowNo}`} className="text-xs font-bold text-[#B00004] hover:underline">แถวในชีต</Link></p>
          ) : <p className="mt-1 text-zinc-600">ไม่พบ Serial นี้ในชีต 1.4</p>}
        </li>
        <li className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-extrabold text-zinc-500">3. บอท Oxide ใช้จ่ายออเดอร์</p>
          {use ? <p className="mt-1"><span className="font-extrabold">{use.orders.toLocaleString()} ออเดอร์</span> · {points(use.points)}<br /><span className="text-xs text-zinc-600">{dateTime(use.first)} – {dateTime(use.last)}</span></p>
            : <p className="mt-1 text-zinc-600">ไม่พบในออเดอร์ที่สำเร็จของบอท (อาจใช้มือ หรือยังไม่ได้ใช้)</p>}
        </li>
      </ol>
      {serialOrders?.error ? <p className="mt-3 text-sm font-bold text-amber-800">{serialOrders.error}</p> : null}
      {serialOrders?.orders?.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr><th className="px-3 py-2">เวลา</th><th className="px-3 py-2">ออเดอร์ลูกค้า</th><th className="px-3 py-2">เกม / แพ็ค</th><th className="px-3 py-2 text-right">แต้มที่ใช้</th><th className="px-3 py-2 text-right">เหลือในบัตร</th></tr>
            </thead>
            <tbody>
              {serialOrders.orders.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100">
                  <td className="whitespace-nowrap px-3 py-1.5">{dateTime(row.at)}</td>
                  <td className="px-3 py-1.5">{row.sourceOrderId || `#${row.id}`}<span className="text-xs text-zinc-500">{row.source ? ` · ${row.source}` : ""}</span></td>
                  <td className="px-3 py-1.5">{row.game}{row.pack ? <span className="text-xs text-zinc-500"> · {row.pack}</span> : null}</td>
                  <td className="px-3 py-1.5 text-right">{row.points == null ? "—" : row.points.toLocaleString("en-US")}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-600">{row.remaining == null ? "—" : row.remaining.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {serialOrders.orders.length >= 300 ? <p className="px-3 py-2 text-xs text-zinc-500">แสดง 300 ออเดอร์ล่าสุด</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export default function OffgamerCardsView({ orders, summary, accounts, listTabId, payments = {}, paymentCount = 0, botUse = {}, botError = "",
  serial = "", serialOrders = null, account = "", month = "", query = "" }) {
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
  const linkedCount = orders.filter((order) => payments[offgamerOrderId(order)]).length;
  const allSerials = orders.flatMap((order) => order.cards.map((card) => card.serial)).filter(Boolean);
  const usedSerials = allSerials.filter((s) => botUse[s]).length;

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

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
        <span className="font-extrabold">เส้นทาง:</span>
        <span>กระเป๋าเงิน (Bybit)</span><ArrowRight size={14} aria-hidden="true" />
        <span>บัญชี OffGamer</span><ArrowRight size={14} aria-hidden="true" />
        <span>บัตร (Serial)</span><ArrowRight size={14} aria-hidden="true" />
        <span>บอท Oxide จ่ายออเดอร์ลูกค้า</span>
        <span className="w-full text-xs text-zinc-600 sm:ml-auto sm:w-auto">
          จับคู่การจ่ายได้ {linkedCount}/{orders.length} ออเดอร์ (จากรายการ &quot;Multi Game Card&quot; {paymentCount} รายการ ยอดหักค่าธรรมเนียมตรงกัน ห่างไม่เกิน {PAYMENT_DAYS} วัน)
          · บัตรที่บอทใช้แล้ว {usedSerials}/{allSerials.length} ใบ
        </span>
        {botError ? <span className="w-full text-xs font-bold text-amber-800">{botError}</span> : null}
      </div>

      {serial ? <CardTrail serial={serial} orders={orders} payments={payments} botUse={botUse} serialOrders={serialOrders} back={href({ account, month, q: query })} /> : null}

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
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr><th className="px-4 py-2.5">วันที่</th><th className="px-4 py-2.5">ออเดอร์ OffGamer</th><th className="px-4 py-2.5">บัญชี / ผู้สั่งซื้อ</th><th className="px-4 py-2.5">จ่ายจาก</th><th className="px-4 py-2.5">บัตร (Serial) → บอทใช้</th><th className="px-4 py-2.5 text-right">USDT</th><th className="px-4 py-2.5">ในชีต</th></tr>
            </thead>
            <tbody>
              {shown.slice(0, SHOWN).map((order) => {
                const values = [...new Set(order.cards.map((card) => card.usdt))];
                const payment = payments[offgamerOrderId(order)];
                const use = orderBotUse(order, botUse);
                return (
                  <tr key={`${order.account}-${order.key}`} className="border-t border-zinc-100 align-top">
                    <td className="whitespace-nowrap px-4 py-2">{order.date}</td>
                    <td className="px-4 py-2 font-extrabold">{order.order || <span className="font-normal text-zinc-400">ชีตไม่ได้ใส่เลข</span>}</td>
                    <td className="px-4 py-2">{order.account}<p className="text-xs text-zinc-500">{order.buyer || "—"}</p></td>
                    <td className="px-4 py-2">
                      {payment ? (
                        <Link href={`/stock/wallets?entry=${payment.id}`} title="เปิดรายการนี้ในกระเป๋าเงิน พร้อมที่มาของเงิน" className="font-bold text-[#B00004] hover:underline">
                          {payment.walletName}<p className="text-xs font-normal text-zinc-600">{payment.date} · {usdt(payment.amount)}</p>
                        </Link>
                      ) : <span className="text-xs text-zinc-400">ยังหาการจ่ายไม่เจอ</span>}
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-bold">{order.cards.length} ใบ{values.length === 1 ? ` × ${usdt(values[0])}` : ""}</p>
                      <p className={`text-xs ${use.used ? "text-emerald-700" : "text-zinc-400"}`}>
                        {use.used ? `บอทใช้แล้ว ${use.used}/${use.cards} ใบ · ${use.botOrders.toLocaleString()} ออเดอร์ · ${points(use.points)}` : "ไม่พบในบอท"}
                      </p>
                      <details className="text-xs text-zinc-600">
                        <summary className="cursor-pointer select-none">ดู Serial</summary>
                        <ul className="mt-1 font-mono">{order.cards.map((card) => (
                          <li key={card.rowNo}>
                            {card.serial ? <Link href={href({ account, month, q: query, serial: card.serial })} className="hover:text-[#B00004] hover:underline">{card.serial}</Link> : "—"}
                            {values.length > 1 ? ` · ${usdt(card.usdt)}` : ""}{card.expiry ? ` · หมดอายุ ${card.expiry}` : ""}
                            {botUse[card.serial] ? <span className="text-emerald-700"> · บอท {botUse[card.serial].orders} ออเดอร์</span> : null}
                          </li>
                        ))}</ul>
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
