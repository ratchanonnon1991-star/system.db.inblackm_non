import Link from "next/link";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Search } from "lucide-react";
import { accountSheetCoverage } from "@/lib/account-sheets";
import { PinToMenuButton } from "@/components/stock-nav-pins";

export const ACCOUNT_SHEET_PAGE_SIZE = 200;

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (period) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const number = (value) => Number(value).toLocaleString("th-TH");

function href(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null));
  const text = search.toString();
  return text ? `/stock/sheets?${text}` : "/stock/sheets";
}

/** 0 → A, 25 → Z, 26 → AA */
function columnName(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function SheetTable({ rows, showWhere = false, markRow = null }) {
  const width = Math.max(1, ...rows.map((row) => row.cells.length));
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
      <table className="min-w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-zinc-50 text-left text-[11px] font-extrabold uppercase text-zinc-500">
          <tr>
            {showWhere && <th className="whitespace-nowrap border-b border-zinc-200 px-3 py-2">มาจาก</th>}
            <th className="border-b border-zinc-200 px-3 py-2">แถว</th>
            {Array.from({ length: width }, (_, col) => (
              <th key={col} className="border-b border-zinc-200 px-3 py-2">{columnName(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.tabId || ""}-${row.rowNo}`} id={markRow === row.rowNo ? "marked-row" : undefined}
              className={`align-top ${markRow === row.rowNo ? "bg-amber-100 outline outline-2 outline-amber-400" : "odd:bg-white even:bg-zinc-50/60"}`}>
              {showWhere && (
                <td className="whitespace-nowrap border-b border-zinc-100 px-3 py-1.5">
                  <Link href={href({ tab: row.tabId, page: Math.floor((row.rowIndex ?? 0) / ACCOUNT_SHEET_PAGE_SIZE) + 1 })} className="font-bold text-[#B00004] hover:underline">
                    {monthLabel(row.period)} · {row.tab}
                  </Link>
                  <div className="text-[11px] text-zinc-500">{row.fileName}</div>
                </td>
              )}
              <td className="border-b border-zinc-100 px-3 py-1.5 text-zinc-400">{row.rowNo}</td>
              {Array.from({ length: width }, (_, col) => (
                <td key={col} className="max-w-[260px] whitespace-pre-wrap break-words border-b border-zinc-100 px-3 py-1.5">{row.cells[col] || ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountSheetsView({ tabs, open, rows, page, query, period, results, markRow = null }) {
  const periods = [...new Set(tabs.map((tab) => tab.period))].sort().reverse();
  const shownPeriod = open?.period || period || periods[0] || "";
  const files = [...new Set(tabs.filter((tab) => tab.period === shownPeriod).map((tab) => tab.fileName))];
  const coverage = accountSheetCoverage(tabs);
  const missing = coverage.filter((line) => !line.page);
  const pages = open ? Math.max(1, Math.ceil(open.rowCount / ACCOUNT_SHEET_PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><FileSpreadsheet size={22} aria-hidden="true" /> ข้อมูลบัญชี</h1>
          <p className="mt-1 text-sm text-zinc-600">
            ทุกแท็บของไฟล์ข้อมูลบัญชีใน Drive แยกตามเดือน · ช่องรหัสผ่าน/PIN ถูกลบออกก่อนเก็บ
          </p>
        </div>
        <form action="/stock/sheets" className="flex flex-wrap items-center gap-2">
          <select name="period" defaultValue={period} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm">
            <option value="">ทุกเดือน</option>
            {periods.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
          </select>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3">
            <Search size={15} className="text-zinc-400" aria-hidden="true" />
            <input name="q" defaultValue={query} placeholder="ค้นในทุกแท็บ เช่น Order, ชื่อ, ยอด" className="w-56 bg-transparent text-sm outline-none" />
          </label>
          <button className="h-10 rounded-xl bg-[#D90005] px-4 text-sm font-extrabold text-white hover:bg-[#B00004]">ค้นหา</button>
        </form>
      </div>

      {!tabs.length && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ยังไม่มีข้อมูล — รัน <code>node scripts/import-account-sheets.mjs &quot;&lt;โฟลเดอร์&gt;&quot; --apply</code>
        </p>
      )}

      {query && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-black">ผลค้นหา “{query}” {period && `· ${monthLabel(period)}`} — {results.length >= 200 ? "200 แถวแรก" : `${results.length} แถว`}</h2>
          {results.length ? <SheetTable rows={results} showWhere /> : <p className="text-sm text-zinc-500">ไม่พบ</p>}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {periods.map((value) => (
              <Link key={value} href={href({ period: value, q: query })}
                className={`rounded-full px-3 py-1 text-xs font-extrabold ${value === shownPeriod ? "bg-[#D90005] text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
                {monthLabel(value)}
              </Link>
            ))}
          </div>
          {files.map((fileName) => (
            <div key={fileName} className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="mb-1.5 text-[13px] font-black text-zinc-800">{fileName}</div>
              <ul className="flex flex-col">
                {tabs.filter((tab) => tab.period === shownPeriod && tab.fileName === fileName).map((tab) => (
                  <li key={tab.id}>
                    <Link href={href({ tab: tab.id })}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[13px] ${open?.id === tab.id ? "bg-red-50 font-extrabold text-[#B00004]" : "text-zinc-700 hover:bg-zinc-50"}`}>
                      <span className="truncate">{tab.tab}</span>
                      <span className="shrink-0 text-[11px] text-zinc-400">{tab.walletCode ? "กระเป๋าเงิน · " : ""}{number(tab.rowCount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          {open ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black">{open.tab}</h2>
                  <p className="text-xs text-zinc-500">{monthLabel(open.period)} · {open.fileName} · {number(open.rowCount)} แถว
                    {open.walletCode && <> · นำเข้า <Link href="/stock/wallets" className="font-bold text-[#B00004] hover:underline">กระเป๋าเงิน</Link> ด้วย</>}
                  </p>
                </div>
                {pages > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    {page > 1 && <Link href={href({ tab: open.id, page: page - 1 })} aria-label="หน้าก่อน" className="rounded-lg p-1.5 ring-1 ring-zinc-200 hover:bg-white"><ChevronLeft size={16} /></Link>}
                    <span>หน้า {page} / {pages}</span>
                    {page < pages && <Link href={href({ tab: open.id, page: page + 1 })} aria-label="หน้าถัดไป" className="rounded-lg p-1.5 ring-1 ring-zinc-200 hover:bg-white"><ChevronRight size={16} /></Link>}
                  </div>
                )}
              </div>
              {markRow ? <a href="#marked-row" className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">ไปที่แถว {markRow} (ไฮไลต์สีเหลือง)</a> : null}
              <SheetTable rows={rows} markRow={markRow} />
            </>
          ) : (
            <details open className="rounded-2xl border border-zinc-200 bg-white p-4">
              <summary className="cursor-pointer text-base font-black">
                ข้อมูลที่ยังไม่มีหน้าในเว็บ: {missing.length} จาก {coverage.length} แท็บ
              </summary>
              <p className="mt-2 text-sm text-zinc-600">
                แท็บกระเป๋าเงินและบัญชีธนาคาร (สีเขียว) มีหน้าแล้วที่ Stock → กระเป๋าเงิน
                ส่วนแท็บอื่นยังไม่มีหน้าเฉพาะ แต่เปิดดูและค้นหาได้ที่หน้านี้
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead className="text-left text-[11px] font-extrabold uppercase text-zinc-500">
                    <tr><th className="px-2 py-1.5">ไฟล์</th><th className="px-2 py-1.5">แท็บ</th><th className="px-2 py-1.5">เดือนที่มี</th><th className="px-2 py-1.5 text-right">แถว</th><th className="px-2 py-1.5">ในเว็บ</th><th className="px-2 py-1.5">เมนู</th></tr>
                  </thead>
                  <tbody>
                    {coverage.map((line) => (
                      <tr key={`${line.fileKind}-${line.tab}`} className="border-t border-zinc-100">
                        <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">{line.fileKind}</td>
                        <td className="px-2 py-1.5 font-bold">{line.tab}</td>
                        <td className="px-2 py-1.5 text-zinc-600">{line.periods.length === periods.length ? "ทุกเดือน" : line.periods.map(monthLabel).join(", ")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{number(line.rows)}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {line.page
                            ? <Link href={line.page.href} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-800 hover:underline">{line.page.label}</Link>
                            : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-extrabold text-amber-800">ยังไม่มี (ดูได้ที่หน้านี้)</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {!line.page && <PinToMenuButton kind={line.fileKind} tab={line.tab} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
