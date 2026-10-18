import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";
import { CODA_SHEET_HEADINGS as headings } from "@/lib/usdcodashop-report";

const money = (value) => value == null ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = "border-r border-ll-hairline px-3 py-3 align-top";

export default function UsdCodashopSheetTable({ entries, emptyMessage = "ไม่พบรายการ" }) {
  return <div className="max-h-[70vh] overflow-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
    <table className="w-full min-w-[2450px] text-left text-sm text-ll-ink">
      <caption className="sr-only">ประวัติ USDCodashop รูปแบบชีท ยอดโอน ต้นทุน กำไร และยอดคงเหลือจาก balance_after</caption>
      <thead className="sticky top-0 z-20 bg-ll-surface-2"><tr>{headings.map((heading) => <th key={heading} scope="col" className="whitespace-nowrap border-r border-ll-hairline px-3 py-3 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>{entries.map((row) => {
        const details = row.details || {}; const figures = row.figures || sheetFigures(details);
        const link = orderLink(details.link); const deposit = row.kind === "deposit";
        return <tr key={row.id} className="border-t border-ll-hairline hover:bg-ll-surface-2">
          <td className={`${cell} whitespace-nowrap`}>{new Date(row.occurredAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" })}<p className="mt-1 text-xs text-ll-ink-subtle">{new Date(row.occurredAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}</p></td>
          <td className={`${cell} max-w-64 break-words font-medium`}>{row.orderId}{details.note && <p className="mt-1 text-xs font-normal text-ll-ink-subtle">{details.note}</p>}</td>
          <td className={`${cell} tabular-nums`}>{money(figures.sale)}{!deposit && details.salePacks > 1 && <p className="mt-1 whitespace-nowrap text-xs text-ll-ink-subtle">หารจากยอดรวม ÷ {details.salePacks} แพ็ก</p>}{!deposit && details.saleConversion && <details className="mt-2 text-xs text-ll-ink-subtle"><summary className="cursor-pointer whitespace-nowrap">เรทที่ใช้</summary><p className="mt-1">{details.saleNative} {details.saleCurrency} × {details.saleConversion.rate} THB</p><p className="mt-1">{details.saleConversion.source} · บันทึก {details.saleConversion.capturedAt ? new Date(details.saleConversion.capturedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "—"}</p><p className="mt-1">วันที่เรท: {details.saleConversion.rateAt ? new Date(details.saleConversion.rateAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "—"}</p><p className="mt-1">เรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง</p></details>}{!deposit && figures.sale == null && details.saleNative != null && <p className="mt-1 whitespace-nowrap text-xs text-ll-ink-subtle">{money(details.saleNative)} {details.saleCurrency || "ไม่ทราบสกุล"}<br />รอเรทแปลงเป็น THB</p>}</td>
          <td className={`${cell} tabular-nums`}>{money(figures.cost)}</td>
          <td className={`${cell} tabular-nums`}>{money(figures.profit)}</td>
          <td className={`${cell} tabular-nums`}>{figures.margin == null ? "—" : `${figures.margin}%`}</td>
          <td className={`${cell} tabular-nums`}>{deposit ? money(row.amount) : "—"}</td>
          <td className={`${cell} tabular-nums`}>{!deposit ? money(row.amount) : "—"}</td>
          <td className={`${cell} font-semibold tabular-nums`}>{money(row.balance)}</td>
          <td className={`${cell} whitespace-nowrap`}>{deposit ? "—" : row.orderDuplicate ? "พบคิวซ้ำ · ตรวจสอบ" : "ไม่ซ้ำ"}</td>
          <td className={cell}>{details.category || "—"}</td>
          <td className={`${cell} max-w-44 break-words`}>{details.sheetOperator || details.operator || "—"}</td>
          <td className={`${cell} max-w-52 break-words`}>{details.customer || "—"}</td>
          <td className={cell}>{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">เปิดรายการ</a> : "—"}</td>
          <td className={`${cell} max-w-56 break-words`}>{details.game || "—"}</td>
          <td className={`${cell} max-w-56 break-words`}>{details.pack || "—"}</td>
          <td className={`${cell} max-w-56 break-words`}>{details.playerId || "—"}</td>
          <td className={`${cell} max-w-64 break-words`}>{details.invoice || "—"}</td>
          <td className={`${cell} whitespace-nowrap`}>{deposit || !details.invoice ? "—" : row.transactionDuplicate ? "พบธุรกรรมซ้ำ · ตรวจสอบ" : "ไม่ซ้ำ"}</td>
          <td className={`${cell} max-w-48 break-words`}>{row.recordedBy}</td>
        </tr>;
      })}</tbody>
    </table>
    {!entries.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">{emptyMessage}</p>}
  </div>;
}
