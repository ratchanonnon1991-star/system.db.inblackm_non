import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";
import { CODA_SHEET_HEADINGS as headings } from "@/lib/usdcodashop-report";
import { tivTable, tivTableBox } from "@/lib/topup-inventory-ui";

const money = (value) => value == null ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function UsdCodashopSheetTable({ entries, emptyMessage = "ไม่พบรายการ" }) {
  return <div className={`${tivTableBox} max-h-[70vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[2450px]`}>
      <caption className="sr-only">ประวัติ USDCodashop รูปแบบชีท ยอดโอน ต้นทุน กำไร และยอดคงเหลือจาก balance_after</caption>
      <thead className="sticky top-0 z-20 backdrop-blur"><tr>{headings.map((heading, i) => <th key={heading} scope="col" className={i >= 2 && i <= 8 ? "r" : ""}>{heading}</th>)}</tr></thead>
      <tbody>{entries.map((row) => {
        const details = row.details || {}; const figures = row.figures || sheetFigures(details);
        const link = orderLink(details.link); const deposit = row.kind === "deposit";
        return <tr key={row.id}>
          <td className="whitespace-nowrap">{new Date(row.occurredAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" })}<span className="sm">{new Date(row.occurredAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}</span></td>
          <td className="max-w-64 break-words font-medium">{row.orderId}{details.note && <span className="sm font-normal">{details.note}</span>}</td>
          <td className="r">{money(figures.sale)}{!deposit && details.salePacks > 1 && <span className="sm whitespace-nowrap">หารจากยอดรวม ÷ {details.salePacks} แพ็ก</span>}{!deposit && details.saleConversion && <details className="mt-2 text-left text-xs text-ll-ink-subtle"><summary className="whitespace-nowrap">เรทที่ใช้</summary><p className="mt-1">{details.saleNative} {details.saleCurrency} × {details.saleConversion.rate} THB</p><p className="mt-1">{details.saleConversion.source} · บันทึก {details.saleConversion.capturedAt ? new Date(details.saleConversion.capturedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "—"}</p><p className="mt-1">วันที่เรท: {details.saleConversion.rateAt ? new Date(details.saleConversion.rateAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "—"}</p><p className="mt-1">เรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง</p></details>}{!deposit && figures.sale == null && details.saleNative != null && <span className="sm whitespace-nowrap">{money(details.saleNative)} {details.saleCurrency || "ไม่ทราบสกุล"}<br />รอเรทแปลงเป็น THB</span>}</td>
          <td className="r">{money(figures.cost)}</td>
          <td className="r">{money(figures.profit)}</td>
          <td className="r">{figures.margin == null ? "—" : `${figures.margin}%`}</td>
          <td className="r">{deposit ? money(row.amount) : "—"}</td>
          <td className="r">{!deposit ? money(row.amount) : "—"}</td>
          <td className="r b">{money(row.balance)}</td>
          <td className="whitespace-nowrap">{deposit ? "—" : row.orderDuplicate ? "พบคิวซ้ำ · ตรวจสอบ" : "ไม่ซ้ำ"}</td>
          <td>{details.category || "—"}</td>
          <td className="max-w-44 break-words">{details.sheetOperator || details.operator || "—"}</td>
          <td className="max-w-52 break-words">{details.customer || "—"}</td>
          <td>{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="tiv-lnk">เปิดรายการ</a> : "—"}</td>
          <td className="max-w-56 break-words">{details.game || "—"}</td>
          <td className="max-w-56 break-words">{details.pack || "—"}</td>
          <td className="max-w-56 break-words">{details.playerId || "—"}</td>
          <td className="max-w-64 break-words">{details.invoice || "—"}</td>
          <td className="whitespace-nowrap">{deposit || !details.invoice ? "—" : row.transactionDuplicate ? "พบธุรกรรมซ้ำ · ตรวจสอบ" : "ไม่ซ้ำ"}</td>
          <td className="max-w-48 break-words">{row.recordedBy}</td>
        </tr>;
      })}</tbody>
    </table>
    {!entries.length && <div className="tiv-dempty m-4"><strong>{emptyMessage}</strong></div>}
  </div>;
}
