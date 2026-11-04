"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";
import { codaEntryWarnings } from "@/lib/usdcodashop-overview";
import { tivTable, tivTableBox } from "@/lib/topup-inventory-ui";

const money = (value) => value == null ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const cell = "min-w-0 md:table-cell";
const num = `${cell} md:text-right`;
const label = "mb-1 block text-xs text-ll-ink-subtle md:hidden";

export default function UsdCodashopOverviewTable({ entries, emptyMessage = "ไม่พบรายการ" }) {
  const [expanded, setExpanded] = useState(new Set());
  function toggle(id) {
    setExpanded((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  return <div className={tivTableBox}>
    <table className={`${tivTable} block md:table md:table-fixed`}>
      <caption className="sr-only">ประวัติ USDCodashop รวมตาม Order และแหล่งที่มา กดเลข Order เพื่อดูรายการย่อย</caption>
      <thead className="hidden md:table-header-group"><tr>{["วันที่", "Order / รายการ", "เกม / แพ็ก", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "USD ออก", "USD คงเหลือ"].map((heading, i) => <th key={heading} scope="col" className={i >= 3 ? "r" : ""}>{heading}</th>)}</tr></thead>
      <tbody className="block md:table-row-group">{entries.map((row) => {
        const d = row.details || {}; const f = row.figures || sheetFigures(d); const deposit = row.kind === "deposit";
        const warnings = codaEntryWarnings(row); const open = expanded.has(row.id); const link = orderLink(d.link);
        return <Fragment key={row.id}>
          <tr className="grid grid-cols-2 md:table-row">
            <td className={cell}><span className={label}>วันที่</span><span className="block">{new Date(row.occurredAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" })}</span><span className="sm">{new Date(row.occurredAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}</span></td>
            <td className={cell}><button type="button" aria-expanded={open} aria-controls={`coda-detail-${row.id}`} aria-label={`${open ? "ซ่อน" : "ดู"}รายละเอียด Order ${row.orderId}`} onClick={() => toggle(row.id)} className="flex w-full items-start justify-between gap-2 break-all text-left font-semibold underline decoration-ll-hairline-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-ll-primary"><span>{row.orderId}</span>{open ? <ChevronUp size={16} className="shrink-0" aria-hidden /> : <ChevronDown size={16} className="shrink-0" aria-hidden />}</button><span className="sm">{deposit ? "เติมเงินเข้า" : "ใช้เงิน"}</span>{warnings.length > 0 && <span className="mt-2 block rounded bg-ll-warning-bg px-2 py-1 text-xs text-ll-warning">{warnings.join(" · ")}</span>}</td>
            <td className={`${cell} col-span-2 break-words`}><span className={label}>{deposit ? "หมายเหตุ" : "เกม / แพ็ก"}</span><span className="block font-medium">{deposit ? d.note || "บันทึก USD เข้า" : d.game || "—"}</span><span className="sm">{deposit ? `USD เข้า ${money(row.amount)}` : d.pack || "—"}</span></td>
            <td className={num}><span className={label}>ยอดโอน (THB)</span><span>{money(f.sale)}</span>{!deposit && row.fillCount > 1 ? <span className="sm">รวม {row.fillCount} รายการย่อย ไม่คิดยอดโอนซ้ำ</span> : !deposit && d.salePacks > 1 && <span className="sm">ส่วนแบ่งยอดรวม ÷ {d.salePacks} แพ็ก</span>}</td>
            <td className={num}><span className={label}>ต้นทุน (THB)</span><span>{money(f.cost)}</span></td>
            <td className={num}><span className={label}>กำไร (THB)</span><span className={f.profit != null && Number(f.profit) < 0 ? "tiv-neg" : "font-medium"}>{money(f.profit)}</span>{f.margin != null && <span className="sm">{f.margin}%</span>}</td>
            <td className={num}><span className={label}>USD ออก</span><span>{deposit ? "—" : money(row.amount)}</span></td>
            <td className={`${num} b col-span-2`}><span className={label}>USD คงเหลือ</span><span>{money(row.balance)}</span></td>
          </tr>
          {open && <tr id={`coda-detail-${row.id}`} className="block bg-ll-surface-2 md:table-row"><td colSpan={8} className="block md:table-cell">
            <section aria-label={`รายละเอียด Order ${row.orderId}`}>
              <h3 className="font-semibold">รายละเอียด {row.orderId}</h3>
              {!deposit && row.fillCount > 1 && <section aria-label="รายการเติมย่อย" className="mt-4 space-y-3"><h4 className="text-sm font-semibold">รายการเติมย่อย ({row.fillCount})</h4>{row.fills.map((fill) => <article key={fill.id} className="tiv-subbox"><p>คิว {fill.sourceId} · {when(fill.occurredAt)} · {fill.details.game} / {fill.details.pack}</p><p className="mt-2">ยอดโอนส่วนแบ่ง {money(fill.figures.sale)} THB · ต้นทุน {money(fill.figures.cost)} THB · USD ออก {money(fill.amount)} · คงเหลือหลังรายการ {money(fill.balance)}</p><p className="mt-2 break-all">ธุรกรรม: {fill.details.invoice || "—"}{fill.transactionDuplicate ? " · พบธุรกรรมซ้ำ ต้องตรวจสอบ" : ""}</p></article>)}</section>}
              {warnings.length > 0 && <p role="status" className="mt-2 rounded bg-ll-warning-bg p-2 text-ll-warning">ต้องตรวจสอบ: {warnings.join(" · ")}</p>}
              <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">{[
                ["ชื่อลูกค้า", d.customer], ["ผู้เติม", d.sheetOperator || d.operator], ["UID / บัญชีปลายทาง", d.playerId], ["Payment method", d.paymentMethod || (deposit ? "เติมเงิน" : null)],
                ["เกม", d.game], ["สิ่งที่ซื้อ", d.pack], ["หมวดสินค้า", d.category], ["เลขธุรกรรม", d.invoice],
                ["USD เข้า", deposit ? money(row.amount) : null], ["USD ออก", !deposit ? money(row.amount) : null],
                ["ต้นทุนเดิมจากฐานข้อมูล (THB)", deposit ? null : money(d.costThb)],
                ["คงเหลือตามบัญชี (ตรวจสอบ)", money(row.calculatedBalance)], ["ผู้บันทึก", row.recordedBy],
                ["วันที่บันทึก", when(row.recordedAt)], ["หมายเหตุ", d.note],
              ].map(([heading, value]) => <div key={heading} className="min-w-0"><dt className="text-xs text-ll-ink-subtle">{heading}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value ?? "—"}</dd></div>)}</dl>
              {link && <a href={link} target="_blank" rel="noopener noreferrer" className="tiv-lnk mt-4 inline-block py-2">เปิดรายการต้นทาง</a>}
              {!deposit && <p className="mt-4 text-xs leading-6 text-ll-ink-subtle">{d.costConversion ? <>ต้นทุนที่แสดง: {row.amount} USD × {d.costConversion.rate} = {money(f.cost)} THB · {d.costConversion.source} · วันที่เรท {when(d.costConversion.rateAt)} · คำนวณด้วยเรทล่าสุด ไม่ใช่ต้นทุนเดิมหรือเรท GOOGLEFINANCE โดยตรง</> : "ต้นทุนแบบชีทต้องใช้เรท USD→THB ล่าสุด ไม่ใช้ต้นทุนเดิมแทนเมื่อดึงเรทไม่ได้"}</p>}
              {!deposit && <details className="mt-4 text-xs text-ll-ink-subtle"><summary className="cursor-pointer py-2">เรทที่ใช้</summary>{d.saleConversion ? <div className="space-y-2 pt-2"><p>{d.saleNative} {d.saleCurrency} × {d.saleConversion.rate} THB</p><p>{d.saleConversion.source} · วันที่เรท {when(d.saleConversion.rateAt)} · ล็อกเรท {when(d.saleConversion.capturedAt)}</p><p>เรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง</p></div> : <p className="pt-2">{d.saleNative != null ? `${d.saleNative} ${d.saleCurrency || "ไม่ทราบสกุล"}` : "ไม่มีข้อมูลยอดสกุลเดิม"} · {f.sale == null ? "ยังไม่มียอด THB ที่ยืนยันได้" : "ไม่พบข้อมูลเรทแปลงเงินในรายการนี้"}</p>}</details>}
            </section>
          </td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
    {!entries.length && <div className="tiv-dempty m-4"><strong>{emptyMessage}</strong></div>}
  </div>;
}
