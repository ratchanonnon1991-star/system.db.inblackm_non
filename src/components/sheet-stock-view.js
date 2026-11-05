import Link from "next/link";
import { Boxes, FileSpreadsheet, Search } from "lucide-react";
import { STOCK_GROUPS, stockItemKey, stockTotals } from "@/lib/sheet-stock";

const GROUP_ORDER = ["balance", "pack", "owed", "money"];
const fmt = (value, digits = 2) => (value == null ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits }));
const baht = (value) => (value == null ? "—" : `฿${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const sheetRow = (count, rowNo) => `/stock/sheets?tab=${count.tabId}&row=${rowNo}`;

function href(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  const text = search.toString();
  return text ? `/stock/sheet-stock?${text}` : "/stock/sheet-stock";
}

function Change({ value }) {
  if (value == null) return <span className="text-xs text-zinc-400">ใหม่</span>;
  if (value === 0) return <span className="text-xs text-zinc-400">เท่าเดิม</span>;
  return <span className={`text-xs font-bold ${value > 0 ? "text-emerald-700" : "text-red-700"}`}>{value > 0 ? "+" : "−"}{fmt(Math.abs(value))}</span>;
}

/** One item across every count: how much the sheets said there was each time. */
function ItemHistory({ counts, itemKey, current }) {
  const rows = counts.map((count) => ({ count, item: count.items.find((it) => stockItemKey(it) === itemKey) })).filter((row) => row.item);
  if (!rows.length) return null;
  const { item } = rows[rows.length - 1];
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-black">{item.name}{item.pack ? ` · ${item.pack}` : ""} <span className="text-sm font-bold text-zinc-500">ในทุกครั้งที่นับ ({rows.length})</span></h2>
        <Link href={href({ count: current?.key })} className="text-sm font-extrabold text-[#B00004] hover:underline">ปิด</Link>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs font-extrabold text-zinc-500">
            <tr><th className="py-1.5 pr-3">ครั้งที่นับ</th><th className="py-1.5 pr-3 text-right">คงเหลือ</th><th className="py-1.5 pr-3 text-right">เปลี่ยน</th><th className="py-1.5 pr-3 text-right">ต้นทุน</th><th className="py-1.5 pr-3 text-right">รวม (THB)</th><th className="py-1.5">ในชีต</th></tr>
          </thead>
          <tbody>
            {rows.map(({ count, item: it }) => (
              <tr key={count.key} className={`border-t border-zinc-100 ${count.key === current?.key ? "bg-amber-50" : ""}`}>
                <td className="py-1.5 pr-3"><Link href={href({ count: count.key, item: itemKey })} className="font-bold hover:underline">{count.label}</Link></td>
                <td className="py-1.5 pr-3 text-right font-extrabold">{fmt(it.qty)}</td>
                <td className="py-1.5 pr-3 text-right"><Change value={it.change} /></td>
                <td className="py-1.5 pr-3 text-right">{fmt(it.unitCost, 4)}</td>
                <td className="py-1.5 pr-3 text-right">{baht(it.thb)}</td>
                <td className="py-1.5"><Link href={sheetRow(count, it.rowNo)} className="text-xs font-bold text-[#B00004] hover:underline">แถว {it.rowNo}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SheetStockView({ counts, current, item = "", query = "" }) {
  if (!current) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7">
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">ยังไม่มีตารางคลังจากชีต — นำเข้าชีตข้อมูลบัญชีก่อน (scripts/import-account-sheets.mjs)</div>
      </div>
    );
  }
  const previous = counts.find((count) => count.key === current.previousKey) || null;
  const totals = stockTotals(current.items);
  const before = previous ? stockTotals(previous.items) : {};
  const needle = query.toLowerCase();
  const shown = current.items.filter((it) => !needle || `${it.name} ${it.pack}`.toLowerCase().includes(needle));
  const stockThb = (totals.balance || 0) + (totals.pack || 0);
  // Stock to THB's rate and discount columns sit off their headers: only its amounts are shown.
  const showCost = !String(current.family || "").startsWith("stock-to-thb");
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-7">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black"><Boxes size={22} aria-hidden="true" /> คลังตามชีต</h1>
        <p className="mt-1 text-sm text-zinc-600">
          ยอดคงเหลือที่ชีตข้อมูลบัญชีนับไว้ (ตาราง Cash Flow) อ่านอย่างเดียว ไม่ได้เปลี่ยนยอดในคลังของระบบ · กดชื่อสินค้าเพื่อดูทุกครั้งที่นับ · กด &quot;แถว&quot; เพื่อเปิดแถวนั้นในชีต
        </p>
      </div>

      <form action="/stock/sheet-stock" className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
        <select name="count" defaultValue={current.key} className="h-10 min-w-0 max-w-full flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm sm:flex-none">
          {[...counts].reverse().map((count) => <option key={count.key} value={count.key}>{count.label} · {baht((stockTotals(count.items).balance || 0) + (stockTotals(count.items).pack || 0))}</option>)}
        </select>
        <label className="flex h-10 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-zinc-300 px-3">
          <Search size={14} className="text-zinc-400" aria-hidden="true" />
          <input name="q" defaultValue={query} placeholder="ค้นชื่อสินค้า เช่น Razer, iTunes, Wuthering" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <button className="h-10 rounded-xl bg-[#D90005] px-4 text-sm font-extrabold text-white hover:bg-[#B00004]">ดู</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-extrabold text-zinc-500">มูลค่าคลังรวม (ยอดเงินเติม + แพ็ก)</p>
          <p className="mt-1 text-2xl font-black">{baht(stockThb)}</p>
          {previous ? <p className="text-xs text-zinc-500">ครั้งก่อน {baht((before.balance || 0) + (before.pack || 0))}</p> : null}
        </div>
        {GROUP_ORDER.filter((group) => totals[group] != null).map((group) => (
          <div key={group} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-extrabold text-zinc-500">{STOCK_GROUPS[group]}</p>
            <p className="mt-1 text-xl font-black">{baht(totals[group])}</p>
            <p className="text-xs text-zinc-500">{current.items.filter((it) => it.group === group).length} รายการ</p>
          </div>
        ))}
      </div>

      <p className="-mt-2 flex flex-wrap items-center gap-x-3 text-xs text-zinc-600">
        <span><FileSpreadsheet size={12} className="inline" aria-hidden="true" /> จาก {current.fileName} › {current.tab}</span>
        <Link href={`/stock/sheets?tab=${current.tabId}`} className="font-bold text-[#B00004] hover:underline">เปิดทั้งแท็บ</Link>
        {previous ? <span>เปลี่ยน = เทียบกับ {previous.label}</span> : null}
        {current.sameAs.length ? <span>ตัวเลขชุดนี้อยู่ในไฟล์เดือน {current.sameAs.sort().join(", ")} ด้วย จึงแสดงครั้งเดียว</span> : null}
        {current.copiedIn?.length ? <span className="text-amber-800">ตารางนี้ถูกคัดลอกไปไว้ใน 1.2 › Cash Flow ของทุกไฟล์เดือน (ม.ค.–ต.ค.) ด้วย: ตัวเลขในแท็บนั้นเป็นของวันที่นับนี้ ไม่ใช่ยอดปัจจุบัน</span> : null}
      </p>

      {item ? <ItemHistory counts={counts} itemKey={item} current={current} /> : null}

      {GROUP_ORDER.map((group) => {
        const list = shown.filter((it) => it.group === group);
        if (!list.length) return null;
        const packs = list.some((it) => it.pack);
        return (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="text-base font-black">{STOCK_GROUPS[group]} <span className="text-sm font-bold text-zinc-500">({list.length})</span></h2>
            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
                  <tr>
                    <th className="px-4 py-2.5">สินค้า</th>
                    {packs ? <th className="px-4 py-2.5">แพ็ก</th> : null}
                    <th className="px-4 py-2.5 text-right">คงเหลือ</th>
                    <th className="px-4 py-2.5 text-right">เปลี่ยน</th>
                    <th className="px-4 py-2.5 text-right">ยอดค้าง</th>
                    {showCost ? <th className="px-4 py-2.5 text-right">ต้นทุน / เรท</th> : null}
                    <th className="px-4 py-2.5 text-right">รวม (THB)</th>
                    <th className="px-4 py-2.5">ในชีต</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((it) => {
                    const key = stockItemKey(it);
                    return (
                      <tr key={`${key}-${it.rowNo}`} className={`border-t border-zinc-100 ${item === key ? "bg-amber-50" : ""}`}>
                        <td className="px-4 py-2"><Link href={href({ count: current.key, item: key, q: query })} className="font-extrabold hover:text-[#B00004] hover:underline">{it.name}</Link></td>
                        {packs ? <td className="px-4 py-2 text-zinc-700">{it.pack}{it.price != null ? <span className="text-xs text-zinc-500"> · {fmt(it.price)}</span> : null}</td> : null}
                        <td className={`px-4 py-2 text-right font-extrabold ${it.qty === 0 ? "text-zinc-400" : ""}`}>{fmt(it.qty)}</td>
                        <td className="px-4 py-2 text-right"><Change value={it.change} /></td>
                        <td className="px-4 py-2 text-right">{it.pending ? fmt(it.pending) : "—"}</td>
                        {showCost ? <td className="px-4 py-2 text-right">{fmt(it.unitCost, 4)}</td> : null}
                        <td className="px-4 py-2 text-right">{baht(it.thb)}</td>
                        <td className="px-4 py-2"><Link href={sheetRow(current, it.rowNo)} className="whitespace-nowrap text-xs font-bold text-[#B00004] hover:underline">แถว {it.rowNo}</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
