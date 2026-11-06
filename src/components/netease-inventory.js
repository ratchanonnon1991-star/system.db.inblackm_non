"use client";

import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { NETEASE_ACCOUNTS, neteaseAccount } from "@/lib/netease-inventory";
import { ChannelReservations } from "@/components/inventory-reservations";

const endpoint = "/api/projectm/netease";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const initialRates = Object.fromEntries(NETEASE_ACCOUNTS.map((a) => [a.id, a.rate || a.divisor]));

function WalletCard({ card, onSelect }) {
  return <article className="tiv-kpi flex flex-col">
    <h3 className="text-base font-bold">{card.name}</h3><p className="mt-1! break-all">{card.email || "ยังไม่มีอีเมลที่ยืนยัน"}</p>
    <small className="mt-4">คงเหลือล่าสุดจากบอท ({card.currency})</small><b className={card.balance == null ? "mut" : ""}>{money(card.balance)}</b>
    <p>{card.balanceAt ? when(card.balanceAt) : "ยังไม่มีประวัติที่ระบุกระเป๋านี้ได้แน่นอน"}</p>
    <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-ll-hairline pt-3 text-sm"><div className="min-w-0"><dt>ใช้ไปในช่วงวันที่</dt><dd className="mt-1! text-base! tabular-nums">{money(card.used)} {card.currency}</dd></div><div className="min-w-0"><dt>ออเดอร์</dt><dd className="mt-1! text-base!">{card.orders ?? "—"}</dd></div></dl>
    {card.pending && <p>รอยืนยันการจับคู่กระเป๋า ไม่แสดงยอดที่ยังตรวจสอบไม่ครบเป็นศูนย์</p>}
    {card.reference && <details className="mt-2 text-xs"><summary className="min-h-11 cursor-pointer py-3 text-ll-ink-subtle">ยอดอ้างอิงจากชีท</summary><dl className="tiv-subbox mt-0! grid grid-cols-3 gap-2"><div className="min-w-0"><dt>ปัจจุบัน</dt><dd className="mt-1! text-sm! tabular-nums">{money(card.reference.current)}</dd></div><div className="min-w-0"><dt>ใช้ไป</dt><dd className="mt-1! text-sm! tabular-nums">{money(card.reference.used)}</dd></div><div className="min-w-0"><dt>คงเหลือ</dt><dd className="mt-1! text-sm! tabular-nums">{money(card.reference.remaining)}</dd></div></dl><p>ไม่ใช่ยอดสด และไม่นำมาบวก/หักกับยอดบอท</p></details>}
    <button type="button" className={`${button} mt-auto w-full`} onClick={onSelect}>ดูรายการ {card.name}</button>
  </article>;
}

function History({ entries }) {
  return <div className={`${tivTableBox} max-h-[70vh] overflow-auto`} role="region" aria-label="ประวัติ Netease" tabIndex={0}>
    <table className={`${tivTable} min-w-[1250px]`}><caption className="sr-only">ประวัติ Netease รวมยอดโอนหนึ่งครั้งต่อออเดอร์และกระเป๋า</caption>
      <thead className="sticky top-0 z-10 backdrop-blur"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "บัญชี", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "ยอดออก", "คงเหลือ (บอท)"].map((h, i) => <th scope="col" key={h} className={i > 2 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.walletKey}:${e.source}:${e.orderId}`}>
        <td className="whitespace-nowrap">{when(e.occurredAt)}</td>
        <td className="max-w-72 break-words"><span className="oid">{e.orderId}</span>{e.details.game}<span className="sm">{e.details.pack}</span><details className="mt-2"><summary>รายละเอียด · {e.fillCount} รายการย่อย</summary><div className="tiv-subbox">
          <p>ลูกค้า: {e.details.customer || "—"} · ผู้เติม: {e.details.sheetOperator || e.details.operator}</p>
          <ul className="mt-2 space-y-2">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline pt-2"><p>{f.details.pack} · ออก {money(f.used)} {f.currency || "ไม่ระบุสกุลเงิน"}</p><p className="break-all">คิวบอท {f.codaId} · ใบเสร็จ {f.details.invoice || "—"}</p></li>)}</ul>
          {e.details.saleNative != null && <p className="mt-2">ยอดโอนสกุลเดิม {e.details.saleNative} {e.details.saleCurrency} {e.details.saleConversion && `(เรทอ้างอิง ${e.details.saleConversion.rate})`}</p>}
        </div></details></td>
        <td className="max-w-60 break-words">{neteaseAccount(e.account)?.name || "ยังไม่ระบุ Pay/Credit"}<span className="sm break-all">{e.email || "ไม่มีอีเมล"}</span></td>
        <td className="r">{money(e.figures.sale)}{e.fillCount > 1 && <span className="sm">รวมแล้ว ไม่คิดซ้ำ</span>}</td>
        <td className="r">{money(e.figures.cost)}</td>
        <td className="r"><span className={Number(e.figures.profit) > 0 ? "tiv-pos" : Number(e.figures.profit) < 0 ? "tiv-neg" : ""}>{money(e.figures.profit)}</span><span className="sm">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</span></td>
        <td className="r">{money(e.used)}<span className="sm">{e.currency || "ยังไม่ยืนยันสกุลเงิน"}</span>{e.conflict && <span className="mt-1 block text-xs">ยอดก่อน/หลังขัดแย้ง</span>}</td>
        <td className="r b">{money(e.balance)}<span className="sm font-normal">{e.currency || "ยังไม่ยืนยันสกุลเงิน"}</span></td>
      </tr>)}</tbody>
    </table>{!entries.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีรายการ</strong>ไม่พบรายการตามตัวกรอง</div>}
  </div>;
}

export default function NeteaseInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), account: "", search: "", rates: JSON.stringify(initialRates), page: "1" }));
  const [draft, setDraft] = useState(filters), [rates, setRates] = useState(initialRates);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), alive = useRef(false);
  const [pageReader] = useState(() => createInventoryPageSession());
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
  const viewKey = new URLSearchParams(filters).toString();
  const load = useCallback(async () => {
    const version = ++generation.current; setLoading(true); setError("");
    try {
      const result = await pageReader.run(endpoint, viewKey);
      if (!Array.isArray(result?.cards) || result.cards.length !== NETEASE_ACCOUNTS.length || !Array.isArray(result.entries) || !result.summary) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey, pageReader]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { generation.current++; setError(""); setFilters(next); setDraft(next); if (new URLSearchParams(next).toString() === viewKey) void load(); }
  const ready = data?.viewKey === viewKey && !loading && !error;
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([key, title]) => ({ key, title, on: Object.entries(codaQuickDates(key)).every(([k, v]) => filters[k] === v) }));
  return <TopupInventoryPage provider="netease" description="Pay / Credit ตามชีท · อ่านประวัติบอท ไม่สั่งเติมและไม่หักเงิน">
    <ChannelReservations lang={lang} channel="netease" />
    <form className="tiv-card" aria-label="กรอง Netease" onSubmit={(e) => { e.preventDefault(); apply({ ...draft, rates: JSON.stringify(rates), page: "1" }); }}>
      <div className="tiv-tools">{quick.map(({ key, title, on }) => <button type="button" aria-pressed={on} className={`${button}${on ? " on" : ""}`} key={key} onClick={() => apply({ ...draft, ...codaQuickDates(key), rates: JSON.stringify(rates), page: "1" })}>{title}</button>)}</div>
      <div className="tiv-fields mt-4">
        <label className={tivField}><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} className={input} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></label>
        <label className={tivField}><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} className={input} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></label>
        <label className={tivField}><span>บัญชี Netease</span><select aria-label="บัญชี Netease" value={draft.account} className={input} onChange={(e) => setDraft({ ...draft, account: e.target.value })}><option value="">ทุกบัญชี</option>{NETEASE_ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="unmapped">ยังไม่ระบุ Pay/Credit</option></select></label>
        <label className={tivField}><span>ค้นหา Order / เกม / อีเมล</span><input type="search" maxLength={200} value={draft.search} className={input} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></label>
      </div>
      <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">เรทต้นทุนตามชีท (ปรับเพื่อดูผลคำนวณ)</summary>
        <p className="tiv-muted mb-3">USD ออก × บาทต่อ USD · KRW ออก ÷ KRW ต่อบาท · ค่าเริ่มต้นจากสูตรในชีท ไม่ใช่เรท GoogleFinance สด การปรับเปลี่ยนเฉพาะหน้าจอและ Export ไม่แก้ประวัติบอท และไม่บันทึกเมื่อเปิดหน้าใหม่</p>
        <div className="tiv-fields">{NETEASE_ACCOUNTS.map((a) => <label key={a.id} className={tivField}><span>{a.name} ({a.divisor ? "KRW ต่อบาท" : "บาทต่อ USD"})</span><input className={`${input} num`} type="number" min="0.00000001" max="999999" step="0.00000001" required value={rates[a.id]} onChange={(e) => setRates({ ...rates, [a.id]: e.target.value })} /></label>)}</div>
      </details>
      <div className="tiv-tools mt-4"><button type="submit" className={tivPrimary}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div>
      <p className="tiv-hint">เวลาไทย · ไม่เกิน 93 วัน · กำไร = ยอดโอน − ต้นทุน · กำไร % = กำไร ÷ ยอดโอน × 100</p>
    </form>
    {error && <p role="alert" className="tiv-alert">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}
    {loading && <p role="status" className="tiv-muted">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      {data.unassigned > 0 && <aside className="tiv-banner"><p>มี {data.unassigned} ออเดอร์ที่ยังระบุ Pay/Credit ไม่ได้ เช่น เมลร่วมของ Pay 2 / Credit 2 จะแสดงประวัติแยกไว้ ไม่เดาชนิดกระเป๋าจากชื่อเกม และไม่ใช้คำนวณยอดคงเหลือบนการ์ดหรือต้นทุน</p><button type="button" className={`${button} mt-3`} onClick={() => apply({ ...filters, account: "unmapped", page: "1" })}>ตรวจรายการที่ยังไม่ระบุกระเป๋า</button></aside>}
      <section aria-label="บัญชี Netease" className="tiv-two">{data.cards.map((card) => <WalletCard key={card.id} card={card} onSelect={() => apply({ ...filters, account: card.id, page: "1" })} />)}</section>
      <div className="tiv-foots"><span>ยอดบอทคือยอดหลังรายการล่าสุด ไม่ใช่การเช็กกระเป๋าสด และไม่เปลี่ยนตามช่วงวันที่ · ใช้ไปบนการ์ดนับตามช่วงวันที่ ไม่ตามคำค้น · ไม่รวม USD กับ KRW · รายการสกุลเงินว่างจะอ้างอิงสกุลเงินได้เฉพาะบัญชีที่จับคู่จากชีทได้แน่นอน</span></div>
      <section className="flex flex-col gap-4" aria-label="ผลการค้นหา"><div className="tiv-sect-h"><h2>ประวัติรายการ</h2><span>{data.total} ออเดอร์ · {data.summary.fills} รายการย่อย</span></div>
        <dl className="tiv-kpis">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB", data.summary.cost], ["กำไร THB", data.summary.profit]].map(([label, value]) => <div key={label} className="tiv-kpi"><dt>{label}</dt><dd className={value == null ? "mut" : ""}>{money(value)}</dd></div>)}</dl>
        {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <div className="tiv-foots"><span role="status">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ต้นทุน {data.summary.missingCosts} รายการ ยอดรวมที่ข้อมูลไม่ครบจะแสดง — ไม่แทนด้วยศูนย์</span></div>}
        <History entries={data.entries} />
        <TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(page) => apply({ ...filters, page: String(page) })} onPageSize={(size) => apply({ ...filters, page: "1", pageSize: String(size) })} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </TopupInventoryPage>;
}
