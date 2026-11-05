"use client";

import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";
import { WAVEPAY_MMK_PER_THB, WAVEPAY_START_DATE, waveDefaultDates, wavePhoneLabel } from "@/lib/wavepay-inventory";
import { ChannelReservations } from "@/components/inventory-reservations";

const endpoint = "/api/projectm/wavepay";
// .tiv-kpi dd is the box's big number; the small figures listed inside a phone's box keep body text.
const figure = "m-0! text-xs! [font-family:inherit]! tracking-normal!";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ks = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const headings = ["วันที่", "ลำดับคิว", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "กำไร (%)", "MMK ออก", "MMK คงเหลือ", "หมวดสินค้า", "ผู้เติม", "ชื่อลูกค้า", "ลิงก์", "เกม", "สิ่งที่ซื้อ", "transaction / UID", "เลขธุรกรรม"];

// The reading above is from an older order: say what happened after it.
function LaterNote({ line }) {
  const uncharged = line.laterUncharged === line.laterOrders;
  return <p><span className={uncharged ? "" : "tiv-warn"}>
    {uncharged
      ? `หลังจากนั้นมี ${line.laterOrders} ออเดอร์ที่บอทไม่ได้ตัดเงิน (ยอดไม่พอ เติมทางอื่น) ยอดนี้จึงยังใช้ได้`
      : `หลังจากนั้นมี ${line.laterOrders} ออเดอร์ที่ไม่ได้บันทึกยอด${line.laterUncharged ? ` (บอทไม่ได้ตัดเงิน ${line.laterUncharged})` : ""} ล่าสุด ${when(line.laterAt)} ยอดจริงอาจต่ำกว่านี้`}
  </span></p>;
}

function LineCard({ line, active, onSelect }) {
  const incomplete = line.missingSales > 0 || line.missingCosts > 0;
  return <button type="button" aria-pressed={active} onClick={onSelect}
    className={`tiv-kpi flex flex-col gap-3 text-left text-ll-ink ${active ? "outline-2 outline-ll-primary" : ""}`}>
    <div className="flex items-start justify-between gap-2"><span className="break-all font-semibold tabular-nums">{wavePhoneLabel(line.phone)}</span><span className="shrink-0 rounded-full bg-ll-surface-2 px-2 py-1 text-xs text-ll-ink-subtle">{line.orders.toLocaleString("en-US")} ออเดอร์</span></div>
    <div><small>คงเหลือล่าสุด (บอท)</small><b>{ks(line.balance)} <span className="text-sm font-normal text-ll-ink-subtle">Ks</span></b><p>ณ {when(line.balanceAt)}</p>{line.laterOrders > 0 && <LaterNote line={line} />}</div>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-ll-hairline pt-3 text-xs">
      <div><dt className="text-ll-ink-subtle">MMK ออก</dt><dd className={`${figure} font-normal!`}>{ks(line.used)}</dd></div>
      <div><dt className="text-ll-ink-subtle">ยอดโอน (THB)</dt><dd className={`${figure} font-normal!`}>{money(line.sale)}</dd></div>
      <div><dt className="text-ll-ink-subtle">ต้นทุน (THB)</dt><dd className={`${figure} font-normal!`}>{money(line.cost)}</dd></div>
      <div><dt className="text-ll-ink-subtle">กำไร (THB)</dt><dd className={`${figure} font-normal!`}>{money(line.profit)}{line.margin != null && ` · ${line.margin}%`}</dd></div>
    </dl>
    {incomplete && <p className="m-0!">ข้อมูลไม่ครบ: ยอดโอน {line.missingSales} · ต้นทุน {line.missingCosts} รายการ (ยอดรวมแสดง —)</p>}
    {line.check && <HandFillSummary check={line.check} />}
  </button>;
}

// What the bot's balance readings cannot explain, beside what people recorded (debit page, sheets).
function HandFillSummary({ check }) {
  const unrecorded = Number(check.unrecordedOut) > 0;
  return <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-ll-hairline pt-3 text-xs">
    <div><dt className="text-ll-ink-subtle">ยอดหายระหว่างบอทอ่าน</dt><dd className={`${figure} font-normal!`}>{ks(check.gapOut)}</dd></div>
    <div><dt className="text-ll-ink-subtle">ยกยอดเติมมือแล้ว</dt><dd className={`${figure} font-normal!`}>{ks(check.recordedOut)}</dd></div>
    <div className="col-span-2"><dt className="text-ll-ink-subtle">ยังไม่มีใครบันทึก</dt>
      <dd className={`${figure} ${unrecorded ? "font-semibold! text-ll-warning" : "font-normal!"}`}>{ks(check.unrecordedOut)}{check.overRecorded && <span className="ml-1 font-normal text-ll-ink-subtle">(ยกยอดมากกว่ายอดที่หาย)</span>}</dd></div>
    <div><dt className="text-ll-ink-subtle">ยอดเพิ่ม (คาดว่าเติมเข้า)</dt><dd className={`${figure} font-normal!`}>{ks(check.gapIn)}</dd></div>
    <div><dt className="text-ll-ink-subtle">บันทึกเติมเข้าแล้ว</dt><dd className={`${figure} font-normal!`}>{ks(check.recordedIn)}</dd></div>
    {Number(check.chargedOut) > 0 && <div className="col-span-2"><dt className="text-ll-ink-subtle">บอทถูกตัดเงิน (ตรงกับคิวที่ค้าง ไม่นับเป็นคนเติม)</dt><dd className={`${figure} font-normal!`}>{ks(check.chargedOut)}</dd></div>}
    {(Number(check.outsideOut) > 0 || Number(check.outsideIn) > 0) && <div className="col-span-2"><dt className="text-ll-ink-subtle">บันทึกนอกช่วงที่บอทอ่าน (เทียบไม่ได้)</dt><dd className={`${figure} font-normal!`}>ออก {ks(check.outsideOut)} · เข้า {ks(check.outsideIn)}</dd></div>}
  </dl>;
}

const LIKELY = { charged: "ตรงกับราคาคิวที่ค้าง (บอทถูกตัดเงิน)", refunded: "ได้คืนในรอบถัดไป" };
function GapTable({ check }) {
  const gaps = check?.gaps ?? [];
  return <div className={`${tivTableBox} max-h-[50vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[760px]`}>
      <caption className="sr-only">ช่วงที่ยอดคงเหลือเปลี่ยนโดยบอทอธิบายไม่ได้ และรายการที่คนบันทึกในวันเดียวกัน</caption>
      <thead className="sticky top-0 z-10 backdrop-blur"><tr>{["ช่วงเวลา", "ทิศทาง", "Ks", "ข้อสังเกต", "ที่บันทึกไว้ในวันเดียวกัน"].map((h) => <th key={h} scope="col" className={h === "Ks" ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{gaps.map((g) => <tr key={`${g.from}|${g.to}|${g.direction}`}>
        <td className="whitespace-nowrap">{when(g.from)} – {when(g.to)}</td>
        <td>{g.direction === "out" ? "หาย (คาดว่าคนเติม)" : "เพิ่ม (คาดว่าเติมเข้า)"}</td>
        <td className="r">{ks(g.amount)}</td>
        <td className="text-xs">{LIKELY[g.likely] || "—"}</td>
        <td className="text-xs">{g.recorded.length ? g.recorded.map((r, i) => <p key={i}>{ks(r.amount)} Ks · {r.orderRef || r.kind} · {r.by || "—"}</p>) : <span className="tiv-warn">ไม่มีบันทึก</span>}</td>
      </tr>)}</tbody>
    </table>
    {!gaps.length && <div className="tiv-dempty m-4"><strong>ไม่พบช่วงที่ยอดไม่ตรงในช่วงวันที่นี้</strong></div>}
  </div>;
}

function OrdersTable({ entries, emptyMessage }) {
  return <div className={`${tivTableBox} max-h-[70vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[2000px]`}>
      <caption className="sr-only">ออเดอร์ WavePay ของเบอร์ที่เลือก ยอดโอน ต้นทุน กำไร และยอดคงเหลือจาก WavePay</caption>
      <thead className="sticky top-0 z-20 backdrop-blur"><tr>{headings.map((h, i) => <th key={h} scope="col" className={i >= 2 && i <= 7 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((row) => {
        const d = row.details || {}; const f = sheetFigures(d); const link = orderLink(d.link);
        return <tr key={row.id}>
          <td className="whitespace-nowrap">{when(row.occurredAt)}</td>
          <td className="max-w-64 break-words font-medium">{row.orderId}</td>
          <td className="r">{money(f.sale)}{d.salePacks > 1 && <span className="sm whitespace-nowrap">หารจากยอดรวม ÷ {d.salePacks} แพ็ก</span>}{f.sale == null && d.saleNative != null && <span className="sm whitespace-nowrap">{money(d.saleNative)} {d.saleCurrency || "ไม่ทราบสกุล"}<br />รอเรทแปลงเป็น THB</span>}{d.saleConversion && <span className="sm whitespace-nowrap">{d.saleNative} {d.saleCurrency} × {d.saleConversion.rate} (เรทวันนี้)</span>}</td>
          <td className="r">{money(f.cost)}</td>
          <td className="r">{money(f.profit)}</td>
          <td className="r">{f.margin == null ? "—" : `${f.margin}%`}</td>
          <td className="r">{ks(row.usedMmk)}{row.usedSource === "pack" && <span className="sm whitespace-nowrap">ตามราคาแพ็ก (ไม่มียอดก่อน/หลัง)</span>}{row.usedSource === "not-charged" && <span className="sm whitespace-nowrap">บอทไม่ได้ตัดเงิน (ยอดไม่พอ)<br />เติมทางอื่น ต้นทุนไม่ทราบ</span>}{row.usedSource === "bot-failed" && <span className="sm whitespace-nowrap"><span className="tiv-warn">บอทเติมไม่สำเร็จ<br />ไม่ทราบว่าตัดเงินไหม</span></span>}</td>
          <td className="r b">{ks(row.balanceMmk)}</td>
          <td>{d.category || "—"}</td>
          <td className="max-w-44 break-words">{d.sheetOperator || d.operator || "—"}</td>
          <td className="max-w-52 break-words">{d.customer || "—"}</td>
          <td>{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="tiv-lnk">เปิดรายการ</a> : "—"}</td>
          <td className="max-w-56 break-words">{d.game || "—"}</td>
          <td className="max-w-56 break-words">{d.pack || "—"}</td>
          <td className="max-w-56 break-words">{d.playerId || "—"}</td>
          <td className="max-w-64 break-words">{d.invoice || "—"}</td>
        </tr>;
      })}</tbody>
    </table>
    {!entries.length && <div className="tiv-dempty m-4"><strong>{emptyMessage}</strong></div>}
  </div>;
}

export default function WavePayInventory({ lang }) {
  const [dates, setDates] = useState(() => waveDefaultDates(codaQuickDates("month")));
  const [draft, setDraft] = useState(dates);
  const [phone, setPhone] = useState(null); const [query, setQuery] = useState(""); const [search, setSearch] = useState("");
  const [page, setPage] = useState(1); const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const alive = useRef(false); const generation = useRef(0);

  const [pageSize, setPageSize] = useState(25);
  const viewKey = new URLSearchParams({ ...dates, search, page: String(page), pageSize: String(pageSize), ...(phone == null ? {} : { phone }) }).toString();
  const [pageReader] = useState(() => createInventoryPageSession());
  const load = useCallback(async () => {
    const key = ++generation.current; setLoading(true); setError("");
    try {
      const result = await pageReader.run(endpoint, viewKey);
      if (!Array.isArray(result?.lines) || !Array.isArray(result.entries)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && key === generation.current) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && key === generation.current && e.name !== "AbortError") setError(e.message); }
    finally { if (alive.current && key === generation.current) setLoading(false); }
  }, [viewKey, pageReader]);
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { setError(""); setPage(1); setDates(next); setDraft(next); setSearch(query); }
  function selectPhone(value) { setPage(1); setPhone((previous) => previous === value ? null : value); }
  const ready = data?.viewKey === viewKey;
  const selected = phone == null ? null : data?.lines.find((l) => l.phone === phone);
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([preset, text]) => ({ preset, text, on: Object.entries(codaQuickDates(preset)).every(([k, v]) => dates[k] === v) }));
  return <TopupInventoryPage provider="wavepay" description="ออเดอร์ completed ที่จ่ายด้วย WavePay จาก codashop_orders แยกตามเบอร์ที่บอทใช้จ่าย">
    <ChannelReservations lang={lang} channel="wavepay" />
    <section aria-label="กรองข้อมูล" className="tiv-card">
      <div className="tiv-tools">{quick.map(({ preset, text, on }) => <button key={preset} disabled={loading} aria-pressed={on} onClick={() => apply(codaQuickDates(preset))} className={`${button}${on ? " on" : ""}`}>{text}</button>)}<span className="tiv-muted">เวลาไทย · ไม่เกิน 93 วัน · เริ่มนับตั้งแต่ {WAVEPAY_START_DATE}</span></div>
      <form onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="mt-4">
        <div className="tiv-fields">
          <label className={tivField}><span>ตั้งแต่วันที่</span><input required type="date" min={WAVEPAY_START_DATE} value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} className={input} /></label>
          <label className={tivField}><span>ถึงวันที่</span><input required type="date" min={draft.dateFrom} value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} className={input} /></label>
          <label className={tivField}><span>ค้นหา Order / เกม / แพ็ก / ลูกค้า</span><input value={query} onChange={(e) => setQuery(e.target.value)} className={input} /></label>
        </div>
        <div className="tiv-tools mt-4">
          <button disabled={loading} className={tivPrimary}>ใช้ตัวกรอง</button>
          <button type="button" disabled={loading} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
        </div>
      </form>
      <p className="tiv-hint">ช่วงที่แสดง: {ready ? data.dateFrom : dates.dateFrom} ถึง {dates.dateTo} (ค.ศ.){ready && data.dateFrom !== dates.dateFrom ? ` · ก่อน ${WAVEPAY_START_DATE} ไม่นับ` : ""}{search ? ` · ค้นหา: ${search}` : ""}</p>
    </section>
    {error && <p role="alert" className="tiv-alert">{error}</p>}
    {loading && <p role="status" className="tiv-muted">กำลังโหลด… (ช่วงวันที่ยาวอาจใช้เวลาสักครู่)</p>}
    {data && <>
      <p className="tiv-muted">ข้อมูลเมื่อ {when(data.observedAt)}{error ? " · แสดงข้อมูลเดิม เนื่องจากโหลดล่าสุดไม่สำเร็จ" : ""}</p>
      {data.gapsAvailable === false && <p role="status" className="tiv-banner">คำนวณยอดที่หายระหว่างบอทอ่านไม่ได้ (ข้อมูลเยอะเกินหรือฐานข้อมูลบอทไม่ตอบ) ลองลดช่วงวันที่</p>}
      {data.ledgerAvailable === false && <p role="status" className="tiv-banner">โหลดยอดเติมมือจากหน้ายกยอดไม่ได้ ตัวเลข &quot;ยกยอดแล้ว&quot; จึงยังไม่ครบ</p>}
      {data.unmatchedLedger?.length > 0 && <p role="status" className="tiv-muted">บัญชี WavePay ที่จับคู่กับเบอร์ไม่ได้ (ชื่อต้องลงท้ายด้วยเลขท้ายเบอร์ในวงเล็บ): {data.unmatchedLedger.join(", ")}</p>}
      <section aria-label="ยอดแต่ละเบอร์" aria-busy={loading} className={`tiv-kpis ${loading ? "opacity-50" : ""}`}>
        {data.lines.map((line) => <LineCard key={line.phone || "unknown"} line={line} active={phone === line.phone} onSelect={() => selectPhone(line.phone)} />)}
      </section>
      <div className="tiv-foots"><span className="leading-6">ยอดคงเหลือ = newBalance ของออเดอร์ล่าสุดของเบอร์นั้น (ไม่ขึ้นกับช่วงวันที่) · MMK ออก = ยอดก่อน − หลังจากกระเป๋า WavePay (ถ้าไม่มีใช้ราคาแพ็ก) · MMK ออก / ยอดโอน / ต้นทุน / กำไร เป็นยอดตามช่วงวันที่ · ต้นทุน = MMK ออก ÷ {WAVEPAY_MMK_PER_THB} (THB) · นับเฉพาะออเดอร์ตั้งแต่ {WAVEPAY_START_DATE} · ยอดโอนสกุลอื่นแปลงด้วยเรทอ้างอิงวันนี้ ไม่ได้ล็อกเรทแบบ USDCodashop · ออเดอร์หลายแพ็กหารยอดโอนต่อแพ็ก · ยอดหายระหว่างบอทอ่าน = ยอดที่ลดลงระหว่างออเดอร์ของบอทโดยบอทไม่ได้ใช้ (น่าจะเป็นคนเติม) · ยกยอดแล้ว = จากหน้ายกยอดและชีตที่นำเข้า (ไม่รวมที่ยกเลิก) · ยังไม่มีใครบันทึก = ยอดที่หาย − ยกยอดแล้ว</span></div>
      {selected?.check && <section className="flex min-w-0 flex-col gap-3" aria-label="ช่วงที่ยอดไม่ตรง">
        <div className="tiv-sect-h"><h2>ช่วงที่ยอดไม่ตรง · {wavePhoneLabel(phone)}</h2></div>
        <p className="tiv-muted">ระหว่างออเดอร์ของบอทสองรายการ ยอดคงเหลือเปลี่ยนโดยไม่มีออเดอร์บอทรองรับ · รายการที่บันทึกจับคู่ตามวัน (ชีตมีแค่วันที่ ไม่มีเวลา)</p>
        <GapTable check={selected.check} />
      </section>}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="tiv-sect-h">
          <h2>{phone == null ? "ออเดอร์ทุกเบอร์" : `ออเดอร์เบอร์ ${wavePhoneLabel(phone)}`}</h2>
          <span>{ready ? `${data.total.toLocaleString("en-US")} รายการ` : "กำลังโหลด…"}{phone != null && <> · <button type="button" onClick={() => selectPhone(phone)} className="tiv-lnk">ดูทุกเบอร์</button></>}{selected == null && phone != null && ready && " · ไม่มีออเดอร์ในช่วงนี้"}</span>
        </div>
        <div aria-busy={loading} className={loading ? "pointer-events-none opacity-50" : ""}><OrdersTable entries={ready ? data.entries : []} emptyMessage={ready ? "ไม่พบออเดอร์ตามตัวกรอง" : "กำลังโหลด…"} /></div>
        <TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(nextPage) => { invalidate(); setPage(nextPage); }} onPageSize={(size) => { invalidate(); setPageSize(size); setPage(1); }} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </TopupInventoryPage>;
}
