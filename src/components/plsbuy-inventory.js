"use client";
import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { PLSBUY_REFERENCE_RATE } from "@/lib/plsbuy-inventory";
import { ChannelReservations } from "@/components/inventory-reservations";
const endpoint = "/api/projectm/plsbuy";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่ระบุเวลา";
const basis = (details) => details.costBasis === "recorded" ? "ต้นทุนที่บันทึกในล็อต MYR" : details.costBasis === "mixed" ? "รวมต้นทุนบันทึกและอ้างอิง" : `อ้างอิงเรท ${details.costRate}`;
function WalletCard({ data }) {
  const api = data.balanceSource === "plsbuy_api";
  return <article className="tiv-kpi">
    <small>{api ? "ยอด Plsbuy ที่บอทเช็กล่าสุด" : "คงเหลือในล็อต MYR ที่ระบุ Plsbuy"}</small>
    <b>{money(data.balance)} MYR</b>
    <p>{api ? `เช็กเมื่อ ${when(data.balanceAt)}` : data.lotCount ? `${data.lotCount} ล็อต · ${when(data.balanceAt)}` : "ยังไม่มียอด API หรือล็อต MYR ที่ยืนยัน ไม่ใช่ยอดศูนย์"}</p>
    {api && <p className="break-all">บันทึกตอนปิดงาน {data.balanceOrderId} · เป็นยอดบัญชี ณ เวลาเช็ก ไม่ใช่ยอดสดตอนเปิดหน้า และไม่เปลี่ยนตามตัวกรอง</p>}
    <p>ไม่หักยอดซ้ำ และไม่นำยอดรวม SYSTEM/NONE มาใช้แทน{api && data.lotBalance != null ? ` · คงเหลือเฉพาะล็อต ${money(data.lotBalance)} MYR` : ""}</p>
  </article>;
}
function History({ entries }) {
  return <div role="region" aria-label="ประวัติ Plsbuy" tabIndex={0} className={`${tivTableBox} max-h-[70vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[1280px]`}><caption className="sr-only">ประวัติ Plsbuy สำเร็จ พร้อมยอด MYR คงเหลือที่บอทเช็กในแต่ละ Order</caption><thead className="sticky top-0 z-10 backdrop-blur"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "MYR ออก", "MYR คงเหลือ", "รายละเอียด"].map((h, i) => <th key={h} scope="col" className={i >= 2 && i <= 6 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.source}:${e.orderId}`}>
        <td className="whitespace-nowrap">{when(e.occurredAt)}</td>
        <td className="max-w-64 break-words"><span className="oid">{e.orderId}</span>{e.details.game}<span className="sm">{e.details.pack}</span><span className="sm">ผู้เติม: {e.details.sheetOperator || e.details.operator}</span></td>
        <td className="r">{money(e.figures.sale)}{e.fillCount > 1 && <span className="sm">รวมแล้ว ไม่คิดซ้ำ</span>}</td>
        <td className="r">{money(e.figures.cost)}<span className="sm">{basis(e.details)}</span></td>
        <td className="r"><span className={Number(e.figures.profit) > 0 ? "tiv-pos" : Number(e.figures.profit) < 0 ? "tiv-neg" : ""}>{money(e.figures.profit)}</span><span className="sm">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</span></td>
        <td className="r b">{money(e.used)}{e.details.usageWarning && <span className="tiv-subbox ml-auto block max-w-56 text-left font-normal">{e.details.usageWarning}</span>}</td>
        <td className="r b">{money(e.wallet?.amount)}<span className="sm font-normal">{e.wallet ? `เช็กเมื่อ ${when(e.wallet.checkedAt)}` : "ยังไม่มียอดที่บันทึก"}</span></td>
        <td className="max-w-72 break-words"><details><summary>{e.fillCount} รายการย่อย</summary><div className="tiv-subbox"><p>ลูกค้า: {e.details.customer || "—"} · UID: {e.details.playerId || "—"}</p><ul className="mt-2 space-y-2">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline pt-2">
          <p>คิว {f.id} · {f.details.pack}</p><p>MYR ออก {money(f.used)}</p>
          {f.details.usageWarning && <p>{f.details.usageWarning}</p>}
          <p>ยอดก่อนเช็ก {money(f.wallet?.before)} MYR · ยอดหลังเช็ก {money(f.wallet?.amount)} MYR</p>
          {f.wallet && <p>เช็กเมื่อ {when(f.wallet.checkedAt)}</p>}
          <p className="break-all">{f.details.invoice || "ไม่มีเลขธุรกรรม"}</p>{f.ledger.map((l) => <p key={l.id}>Ledger: {money(l.used)} MYR · {l.typed ? `คงเหลือเฉพาะล็อต ${money(l.balance)}` : "SYSTEM/NONE ไม่ใช่ยอดคงเหลือ Plsbuy"}</p>)}
        </li>)}</ul></div></details></td>
      </tr>)}</tbody>
    </table>{!entries.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีรายการ</strong>ไม่พบรายการสำเร็จตามตัวกรอง</div>}
  </div>;
}
export default function PlsbuyInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), search: "", rate: PLSBUY_REFERENCE_RATE, page: "1" }));
  const [draft, setDraft] = useState(filters), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), alive = useRef(false), viewKey = new URLSearchParams(filters).toString();
  const [pageReader] = useState(() => createInventoryPageSession());
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
  const load = useCallback(async () => {
    const version = ++generation.current; setLoading(true); setError("");
    try {
      const result = await pageReader.run(endpoint, viewKey);
      if (!Array.isArray(result?.entries) || !result.summary || !result.reference || !Number.isFinite(result.total)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey, pageReader]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { invalidate(); setError(""); setFilters(next); setDraft(next); if (new URLSearchParams(next).toString() === viewKey) void load(); }
  const ready = data?.viewKey === viewKey && !loading && !error;
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([key, title]) => ({ key, title, on: Object.entries(codaQuickDates(key)).every(([k, v]) => filters[k] === v) }));
  return <TopupInventoryPage provider="plsbuy" description="ประวัติสำเร็จจากบอท · อ่านอย่างเดียว ไม่สั่งเติมและไม่หักยอดซ้ำ">
    <ChannelReservations lang={lang} channel="plsbuy" />
    <form className="tiv-card" aria-label="กรอง Plsbuy" onSubmit={(e) => { e.preventDefault(); apply({ ...draft, page: "1" }); }}>
      <div className="tiv-tools">{quick.map(({ key, title, on }) => <button type="button" key={key} aria-pressed={on} className={`${button}${on ? " on" : ""}`} onClick={() => apply({ ...draft, ...codaQuickDates(key), page: "1" })}>{title}</button>)}</div>
      <div className="tiv-fields mt-4"><label className={tivField}><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} className={input} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></label><label className={tivField}><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} className={input} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></label><label className={tivField}><span>ค้นหา Order / เกม / ผู้เติม</span><input type="search" maxLength={200} value={draft.search} className={input} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></label><label className={tivField}><span>เรทอ้างอิง THB ต่อ MYR</span><input type="number" min="0.00000001" max="999999" step="0.00000001" required value={draft.rate} className={`${input} num`} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} /></label></div>
      <div className="tiv-tools mt-4"><button type="submit" className={tivPrimary}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div>
      <p className="tiv-hint">เวลาไทย · ไม่เกิน 93 วัน · เรทตั้งต้นจากชีท {PLSBUY_REFERENCE_RATE} · การปรับมีผลต่อหน้าจอ/CSV เท่านั้น ไม่บันทึกหรือแก้ประวัติบอท</p>
    </form>
    {error && <p role="alert" className="tiv-alert">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}{loading && <p role="status" className="tiv-muted">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      <section className="tiv-two" aria-label="ยอดคงเหลือและอ้างอิง"><WalletCard data={data} /><article className="tiv-kpi"><small>ยอดอ้างอิงจากไฟล์ชีท (MYR)</small><dl className="mt-1 grid grid-cols-3 gap-3">{[["ปัจจุบัน", data.reference.current], ["ใช้ไป", data.reference.used], ["คงเหลือ", data.reference.remaining]].map(([title, v]) => <div key={title} className="min-w-0"><dt className="text-xs text-ll-ink-subtle">{title}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{money(v)}</dd></div>)}</dl><p>สถานะอ้างอิง: {data.reference.status} · ไม่ใช่ยอดสด ไม่นำมาหักยอดออกซ้ำ และไม่ได้ยืนยันวันตัดยอด</p></article></section>
      <p className="tiv-banner">ยอดออกใช้ amount_used ที่บอทบันทึกให้คิว PlsbuyMYR หากล็อตเป็น SYSTEM/NONE ต้นทุน 0 จะไม่ถูกนับเป็นต้นทุนจริง แต่ใช้อ้างอิง MYR ออก × เรทที่เลือก หากพบต้นทุนล็อต MYR จริงจะใช้ค่าที่บันทึกนั้นและไม่แปลงซ้ำ</p>
      <section className="flex flex-col gap-4" aria-label="ผลการค้นหา"><div className="tiv-sect-h"><h2>ประวัติ Plsbuy · {data.total} ออเดอร์</h2><span>{data.summary.fills} รายการย่อย</span></div><dl className="tiv-kpis">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB (รวมค่าอ้างอิง)", data.summary.cost], ["กำไร THB (รวมค่าอ้างอิง)", data.summary.profit], ["MYR ออก (รวมยอดอ้างอิงบอทถ้ามี)", data.summary.used]].map(([title, v]) => <div key={title} className="tiv-kpi"><dt>{title}</dt><dd className={v == null ? "mut" : ""}>{money(v)}</dd></div>)}</dl>
        <div className="tiv-foots"><span>กำไร % = (ยอดโอน − ต้นทุน) ÷ ยอดโอน × 100 · ค่าอ้างอิงจะเปลี่ยนเมื่อปรับเรท ไม่ใช่ต้นทุนซื้อจริงย้อนหลัง · ไม่นับรายการ Failed/Manual ว่าเติมสำเร็จ</span>
          {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <span role="status">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ยอดออก {data.summary.missingUsage} · ต้นทุน {data.summary.missingCosts} รายการ ยอดรวมที่ข้อมูลไม่ครบแสดง — ไม่แทนด้วยศูนย์</span>}
          <span>เลื่อนตารางแนวนอนเพื่อดู MYR คงเหลือ · ใช้ยอดบัญชีที่บอทเช็กล่าสุดภายใน Order นั้น ไม่ใช่ยอดสดหรือผลรวมยอดคงเหลือ · รายการเก่าที่ไม่เคยบันทึกจะแสดง —</span></div>
        <History entries={data.entries} /><TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(page) => apply({ ...filters, page: String(page) })} onPageSize={(size) => apply({ ...filters, page: "1", pageSize: String(size) })} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </TopupInventoryPage>;
}
