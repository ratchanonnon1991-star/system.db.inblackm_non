"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";
import { codaEntryWarnings } from "@/lib/usdcodashop-overview";

const money = (value) => value == null ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const cell = "min-w-0 px-4 py-3 align-top md:table-cell";
const label = "mb-1 block text-xs text-ll-ink-subtle md:hidden";

export default function UsdCodashopOverviewTable({ entries, emptyMessage = "ไม่พบรายการ" }) {
  const [expanded, setExpanded] = useState(new Set());
  function toggle(id) {
    setExpanded((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  return <div className="overflow-hidden rounded-xl border border-ll-hairline bg-ll-surface-1">
    <table className="block w-full text-left text-sm text-ll-ink md:table md:table-fixed">
      <caption className="sr-only">ประวัติ USDCodashop แบบย่อ กดเลข Order เพื่อดูรายละเอียด</caption>
      <thead className="hidden bg-ll-surface-2 md:table-header-group"><tr>{["วันที่", "Order / รายการ", "เกม / แพ็ก", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "USD คงเหลือ"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 text-xs font-medium">{heading}</th>)}</tr></thead>
      <tbody className="block md:table-row-group">{entries.map((row) => {
        const d = row.details || {}; const f = row.figures || sheetFigures(d); const deposit = row.kind === "deposit";
        const warnings = codaEntryWarnings(row); const open = expanded.has(row.id); const link = orderLink(d.link);
        return <Fragment key={row.id}>
          <tr className="grid grid-cols-2 border-t border-ll-hairline md:table-row">
            <td className={cell}><span className={label}>วันที่</span><span className="block">{new Date(row.occurredAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" })}</span><span className="text-xs text-ll-ink-subtle">{new Date(row.occurredAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}</span></td>
            <td className={cell}><button type="button" aria-expanded={open} aria-controls={`coda-detail-${row.id}`} aria-label={`${open ? "ซ่อน" : "ดู"}รายละเอียด Order ${row.orderId}`} onClick={() => toggle(row.id)} className="flex w-full items-start justify-between gap-2 break-all text-left font-semibold underline decoration-ll-hairline-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-ll-primary"><span>{row.orderId}</span>{open ? <ChevronUp size={16} className="shrink-0" aria-hidden /> : <ChevronDown size={16} className="shrink-0" aria-hidden />}</button><span className="mt-1 block text-xs text-ll-ink-subtle">{deposit ? "เติมเงินเข้า" : "ใช้เงิน"}</span>{warnings.length > 0 && <span className="mt-2 block rounded bg-ll-warning-bg px-2 py-1 text-xs text-ll-warning">{warnings.join(" · ")}</span>}</td>
            <td className={`${cell} col-span-2 break-words`}><span className={label}>{deposit ? "หมายเหตุ" : "เกม / แพ็ก"}</span><p className="font-medium">{deposit ? d.note || "บันทึก USD เข้า" : d.game || "—"}</p><p className="mt-1 text-xs text-ll-ink-subtle">{deposit ? `USD เข้า ${money(row.amount)}` : d.pack || "—"}</p></td>
            <td className={`${cell} tabular-nums`}><span className={label}>ยอดโอน (THB)</span><span>{money(f.sale)}</span></td>
            <td className={`${cell} tabular-nums`}><span className={label}>ต้นทุน (THB)</span><span>{money(f.cost)}</span></td>
            <td className={`${cell} tabular-nums`}><span className={label}>กำไร (THB)</span><span className={f.profit != null && Number(f.profit) < 0 ? "text-ll-primary-subtle-text" : "font-medium"}>{money(f.profit)}</span>{f.margin != null && <span className="mt-1 block text-xs text-ll-ink-subtle">{f.margin}%</span>}</td>
            <td className={`${cell} font-semibold tabular-nums`}><span className={label}>USD คงเหลือ</span><span>{money(row.balance)}</span></td>
          </tr>
          {open && <tr id={`coda-detail-${row.id}`} className="block border-t border-ll-hairline bg-ll-surface-2 md:table-row"><td colSpan={7} className="block p-5 md:table-cell">
            <section aria-label={`รายละเอียด Order ${row.orderId}`}>
              <h3 className="font-semibold">รายละเอียด {row.orderId}</h3>
              {warnings.length > 0 && <p role="status" className="mt-2 rounded bg-ll-warning-bg p-2 text-ll-warning">ต้องตรวจสอบ: {warnings.join(" · ")}</p>}
              <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">{[
                ["ชื่อลูกค้า", d.customer], ["ผู้เติม", d.sheetOperator || d.operator], ["UID / บัญชีปลายทาง", d.playerId], ["Payment method", d.paymentMethod || (deposit ? "เติมเงิน" : null)],
                ["เกม", d.game], ["สิ่งที่ซื้อ", d.pack], ["หมวดสินค้า", d.category], ["เลขธุรกรรม", d.invoice],
                ["USD เข้า", deposit ? money(row.amount) : null], ["USD ออก", !deposit ? money(row.amount) : null],
                ["คงเหลือตามบัญชี (ตรวจสอบ)", money(row.calculatedBalance)], ["ผู้บันทึก", row.recordedBy],
                ["วันที่บันทึก", when(row.recordedAt)], ["หมายเหตุ", d.note],
              ].map(([heading, value]) => <div key={heading} className="min-w-0"><dt className="text-xs text-ll-ink-subtle">{heading}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value ?? "—"}</dd></div>)}</dl>
              {link && <a href={link} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block py-2 underline underline-offset-4">เปิดรายการต้นทาง</a>}
              {!deposit && <details className="mt-4 text-xs text-ll-ink-subtle"><summary className="cursor-pointer py-2">เรทที่ใช้</summary>{d.saleConversion ? <div className="space-y-2 pt-2"><p>{d.saleNative} {d.saleCurrency} × {d.saleConversion.rate} THB</p><p>{d.saleConversion.source} · วันที่เรท {when(d.saleConversion.rateAt)} · ล็อกเรท {when(d.saleConversion.capturedAt)}</p><p>เรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง</p></div> : <p className="pt-2">{d.saleNative != null ? `${d.saleNative} ${d.saleCurrency || "ไม่ทราบสกุล"}` : "ไม่มีข้อมูลยอดสกุลเดิม"} · {f.sale == null ? "ยังไม่มียอด THB ที่ยืนยันได้" : "ไม่พบข้อมูลเรทแปลงเงินในรายการนี้"}</p>}</details>}
            </section>
          </td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
    {!entries.length && <p className="p-8 text-center text-sm text-ll-ink-subtle">{emptyMessage}</p>}
  </div>;
}
