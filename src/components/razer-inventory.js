"use client";
import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivCheck, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { RAZER_STATUS_LABELS } from "@/lib/profit-razer-status";
import { RAZER_INVENTORY_ZONES, RAZER_MIXED_ZONE } from "@/lib/razer-inventory";

const endpoint = "/api/projectm/razer";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่ระบุเวลา";
const statusLabel = (v) => RAZER_STATUS_LABELS[v] || (v === "UNVERIFIED" ? "พบจากประวัติ ยังไม่ยืนยันสต็อก" : v);

function PageButtons({ page, size, total, onChange, label }) {
  return <nav aria-label={label} className="tiv-tools justify-end"><button type="button" className={button} disabled={page <= 1} onClick={() => onChange(page - 1)}>ก่อนหน้า</button><span className="tiv-muted">หน้า {page} / {Math.max(1, Math.ceil(total / size))}</span><button type="button" className={button} disabled={page * size >= total} onClick={() => onChange(page + 1)}>ถัดไป</button></nav>;
}
function AccountTable({ accounts, onChoose }) {
  return <div role="region" aria-label="ตารางบัญชี Razer" tabIndex={0} className={`${tivTableBox} max-h-[65vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[1050px]`}><caption className="sr-only">บัญชี Razer ทุกสกุลจากสต็อกเดิม ประวัติการซื้อ และหน้ายกยอด</caption>
      <thead className="sticky top-0 z-10 backdrop-blur"><tr>{["บัญชี / โซน", "สถานะ", "Gold", "Silver", "เรทในสต็อก (THB)", "ยอดบันทึกล่าสุด", "ประวัติ"].map((h, i) => <th scope="col" key={h} className={i >= 2 && i <= 4 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{accounts.map((a) => <tr key={a.key}><td className="max-w-72 break-all"><span className="oid">{a.email}</span><span className="sm">{a.zone}{a.hidden && " · ซ่อนใน Stock"}</span></td><td className="max-w-52">{a.balanceSource === "ledger" ? "มีแค่ในชีต/หน้ายกยอด ยังไม่อยู่ใน Stock" : statusLabel(a.status)}{a.inUse && <span className="mt-1 block text-xs">มีงานกำลังใช้บัญชี</span>}</td><td className="r">{money(a.gold)}</td><td className="r">{money(a.silver)}</td><td className="r">{a.rate || "—"}</td><td>{when(a.balanceAt)}<span className="sm">{a.balanceSource === "purchase" ? "ยอดหลังซื้อจากประวัติบอท" : a.balanceSource === "ledger" ? "ไม่มียอดคงเหลือ" : "ยอดจาก Razer Stock"}</span></td><td><button type="button" className={button} onClick={() => onChoose(a.key)}>ดูออเดอร์</button></td></tr>)}</tbody>
    </table>{!accounts.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีบัญชี</strong>ไม่พบบัญชีตามตัวกรอง</div>}
  </div>;
}
function OrderTable({ entries }) {
  return <div role="region" aria-label="ประวัติออเดอร์ Razer" tabIndex={0} className={`${tivTableBox} max-h-[70vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[1250px]`}><caption className="sr-only">รายการ Razer สำเร็จตามตัวกรอง ต้นทุนเป็นค่าอ้างอิง ไม่ใช่ต้นทุนล็อกย้อนหลัง</caption>
      <thead className="sticky top-0 z-10 backdrop-blur"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "บัญชี / โซน", "ยอดโอน THB", "ต้นทุนอ้างอิง THB", "กำไรอ้างอิง THB / %", "Gold ออก", "Gold คงเหลือ"].map((h, i) => <th scope="col" key={h} className={i > 2 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={e.id}><td className="whitespace-nowrap">{when(e.occurredAt)}</td><td className="max-w-72 break-words"><span className="oid">{e.orderId}{e.source === "manual" && <span className="ml-2 rounded-full border border-ll-hairline px-2 py-0.5 text-xs font-normal">เติมมือ</span>}</span>{e.details.note && <span className="sm">{e.details.note}</span>}{e.details.game}<span className="sm">{e.details.pack}</span><details className="mt-2"><summary>รายละเอียด · {e.fillCount} รายการย่อย</summary><div className="tiv-subbox"><p>ผู้เติม: {e.details.sheetOperator || e.details.operator} · ลูกค้า: {e.details.customer || "—"}</p><ul className="mt-2 space-y-2">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline pt-2"><p>{f.details.pack} · Gold ออก {money(f.used)} {f.zone}</p><p className="break-all">คิว {f.codaId || "—"} · ธุรกรรม {f.details.invoice || "—"}</p></li>)}</ul></div></details></td>
        <td className="max-w-64 break-all">{e.email || "ไม่ระบุบัญชี"}<span className="sm">{e.zone}</span></td><td className="r">{money(e.figures.sale)}{e.fillCount > 1 && <span className="sm">รวมแล้ว ไม่คิดซ้ำ</span>}</td><td className="r">{money(e.figures.cost)}<span className="sm">เรท {e.details.costRate || "—"}</span></td><td className="r"><span className={Number(e.figures.profit) > 0 ? "tiv-pos" : Number(e.figures.profit) < 0 ? "tiv-neg" : ""}>{money(e.figures.profit)}</span><span className="sm">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</span></td><td className="r">{money(e.used)}{e.conflict && <span className="mt-1 block text-xs">ยอดก่อน/หลังขัดแย้ง</span>}</td><td className="r b">{money(e.balance)}</td></tr>)}</tbody>
    </table>{!entries.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีรายการ</strong>ไม่พบรายการสำเร็จตามตัวกรอง</div>}
  </div>;
}

export default function RazerInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), zone: "", account: "", status: "", search: "", rates: "{}", showHidden: "false", page: "1", accountPage: "1" }));
  const [draft, setDraft] = useState(filters), [rates, setRates] = useState({});
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), alive = useRef(false);
  const [pageReader] = useState(() => createInventoryPageSession());
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
  const viewKey = new URLSearchParams(filters).toString();
  const load = useCallback(async () => {
    const version = ++generation.current; setLoading(true); setError("");
    try {
      const result = await pageReader.run(endpoint, viewKey);
      if (!Array.isArray(result?.zones) || result.zones.length !== 2 || !Array.isArray(result.accounts) || !Array.isArray(result.accountChoices) || !Array.isArray(result.entries) || !result.summary) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey, pageReader]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { invalidate(); setError(""); setFilters(next); setDraft(next); if (new URLSearchParams(next).toString() === viewKey) void load(); }
  function applyDraft(next = draft) { apply({ ...next, rates: JSON.stringify(Object.fromEntries(Object.entries(rates).filter(([, v]) => v !== ""))), page: "1", accountPage: "1" }); }
  const ready = data?.viewKey === viewKey && !loading && !error;
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([key, title]) => ({ key, title, on: Object.entries(codaQuickDates(key)).every(([k, v]) => filters[k] === v) }));
  return <TopupInventoryPage provider="razer" description="ทุกสกุล · อ่านบัญชีเดิม ประวัติบอท และยอดเติมมือจากหน้ายกยอด ไม่สั่งเติมหรือหักยอด">
    <form aria-label="กรอง Razer" className="tiv-card" onSubmit={(e) => { e.preventDefault(); applyDraft(); }}>
      <div className="tiv-tools">{quick.map(({ key, title, on }) => <button type="button" key={key} aria-pressed={on} className={`${button}${on ? " on" : ""}`} onClick={() => applyDraft({ ...draft, ...codaQuickDates(key) })}>{title}</button>)}</div>
      <div className="tiv-fields mt-4"><label className={tivField}><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} className={input} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></label><label className={tivField}><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} className={input} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></label><label className={tivField}><span>สกุลเงิน</span><select value={draft.zone} className={input} onChange={(e) => setDraft({ ...draft, zone: e.target.value, account: "" })}><option value="">ทุกสกุล</option>{RAZER_INVENTORY_ZONES.map((z) => <option key={z} value={z}>{z === RAZER_MIXED_ZONE ? "OTHER (หลายสกุล)" : z}</option>)}</select></label><label className={tivField}><span>บัญชี Razer</span><select aria-label="บัญชี Razer" value={draft.account} className={input} onChange={(e) => setDraft({ ...draft, account: e.target.value })}><option value="">ทุกบัญชี</option>{(data?.accountChoices || []).filter((a) => !draft.zone || a.zone === draft.zone).map((a) => <option key={a.key} value={a.key}>{a.zone} · {a.email}</option>)}</select></label><label className={tivField}><span>ค้นหา Order / เกม / อีเมล</span><input type="search" maxLength={200} value={draft.search} className={input} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></label><label className={`${tivCheck} self-end`}><input type="checkbox" checked={draft.showHidden === "true"} onChange={(e) => setDraft({ ...draft, showHidden: String(e.target.checked), account: "" })} />รวมบัญชีที่ซ่อนใน Stock</label></div>
      <label className={`${tivField} mt-4 max-w-sm`}><span>สถานะบัญชี</span><select className={input} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value, account: "" })}><option value="">ทุกสถานะ</option><option value="READY">พร้อมใช้ (Active / เปิดบอท / ไม่ติดงาน)</option>{Object.entries(RAZER_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="UNVERIFIED">ยังไม่ยืนยันสต็อก</option></select></label>
      <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">เรทต้นทุนอ้างอิง</summary><p className="tiv-muted mb-3">เว้นว่างเพื่อใช้เรทใน Razer Stock ของแต่ละบัญชี หากไม่มีเรทจะแสดง — · กรอกเพื่อจำลองทั้งโซนเฉพาะหน้าจอและ CSV ไม่บันทึกลงบัญชี และไม่ใช่ต้นทุนล็อกย้อนหลัง</p><div className="tiv-fields">{RAZER_INVENTORY_ZONES.filter((z) => z !== RAZER_MIXED_ZONE).map((zone) => <label key={zone} className={tivField}><span>บาทต่อ Gold ({zone})</span><input type="number" min="0.00000001" max="999999" step="0.00000001" value={rates[zone] ?? ""} className={`${input} num`} onChange={(e) => setRates({ ...rates, [zone]: e.target.value })} /></label>)}</div></details>
      <div className="tiv-tools mt-4"><button type="submit" className={tivPrimary}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div><p className="tiv-hint">เวลาไทย · เลือกได้ไม่เกิน 93 วัน · ประวัติเฉพาะรายการสำเร็จ · รายการติดป้าย &quot;เติมมือ&quot; มาจากหน้ายกยอดหรือประวัติชีทที่นำเข้า (ไม่รวมรายการที่ยกเลิก)</p>
    </form>
    {error && <p role="alert" className="tiv-alert">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}{loading && <p role="status" className="tiv-muted">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      {!data.stockAvailable && <p role="status" className="tiv-banner">โหลด Razer Stock ไม่ได้ ขณะนี้แสดงเฉพาะบัญชีและยอดที่พบในประวัติบอท ไม่ใช่สต็อกทั้งหมด และไม่มีเรทต้นทุนของบัญชีให้ใช้อ้างอิง</p>}
      {!data.ledgerAvailable && <p role="status" className="tiv-banner">โหลดยอดเติมมือจากหน้ายกยอดไม่ได้ ขณะนี้แสดงเฉพาะยอดที่บอทใช้</p>}
      <section aria-label="ภาพรวมแยกสกุลเงิน" className="tiv-two">{data.zones.filter((z) => z.zone === filters.zone || z.accounts || z.orders).map((z) => <article key={z.zone} className="tiv-kpi"><h2 className="text-base font-bold">Razer {z.zone}{z.mixed && " · หลายสกุล"}</h2><p>{z.accounts} บัญชี{!data.stockAvailable && " · เฉพาะที่พบในประวัติ"}{z.noBalance > 0 && ` · ไม่มียอดคงเหลือ ${z.noBalance} บัญชี (มีแค่ในชีต/หน้ายกยอด)`}{z.mixed && " · ไม่รวม Gold เพราะปนหลายสกุล"}</p><dl className="mt-3 grid grid-cols-2 gap-3">{[["Gold คงเหลือ", z.gold], ["Silver", z.silver], ["Gold ออก (บอท)", z.used], [`Gold เติมมือ · ${z.manualOrders} ออเดอร์`, z.manualUsed]].map(([title, value]) => <div key={title} className="min-w-0"><dt>{title}</dt><dd className={value == null ? "mut" : ""}>{money(value)}</dd></div>)}</dl></article>)}</section>
      <div className="tiv-foots"><span>Gold / Silver แยกตามสกุล ไม่บวกรวมต่างสกุล · การ์ดแสดงเฉพาะสกุลที่มีบัญชีหรือออเดอร์ · ยอดคงเหลือคือค่าบันทึกล่าสุด ไม่ใช่ยอดตรวจสด และไม่เปลี่ยนตามวันที่/คำค้น · ยอดออกนับตามตัวกรอง</span></div>
      <section className="flex flex-col gap-4" aria-label="บัญชีสต็อก"><div className="tiv-sect-h"><h2>บัญชี Razer · {data.accountTotal} บัญชี</h2>{data.canOpenStock && <Link className={button} href="/profit/razer-stock">จัดการ Razer Stock เดิม</Link>}</div><AccountTable accounts={data.accounts} onChoose={(key) => apply({ ...filters, account: key, search: "", page: "1", accountPage: "1" })} /><PageButtons label="เปลี่ยนหน้าบัญชี" page={data.accountPage} size={50} total={data.accountTotal} onChange={(page) => apply({ ...filters, accountPage: String(page) })} /></section>
      <section className="flex flex-col gap-4" aria-label="รายการใช้ Gold"><div className="tiv-sect-h"><h2>ประวัติออเดอร์ · {data.total} ออเดอร์</h2><span>{data.summary.fills} รายการย่อย</span></div><dl className="tiv-kpis">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุนอ้างอิง THB", data.summary.cost], ["กำไรอ้างอิง THB", data.summary.profit]].map(([title, value]) => <div key={title} className="tiv-kpi"><dt>{title}</dt><dd className={value == null ? "mut" : ""}>{money(value)}</dd></div>)}</dl>
        <div className="tiv-foots"><span>ต้นทุนอ้างอิง = Gold ออก × เรทที่เลือก/เรทใน Stock ปัจจุบัน กำไรอ้างอิงจะเปลี่ยนหากเรทเปลี่ยน ไม่ใช่ต้นทุนซื้อจริงย้อนหลัง · รายการเติมมือที่บันทึกต้นทุนไว้ใช้ต้นทุนนั้น · ยอดรวมนี้รวมรายการเติมมือด้วย · ไม่ได้ลดยอดบัญชีซ้ำ</span>
          {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <span role="status">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ต้นทุน {data.summary.missingCosts} รายการ ยอดรวมที่คำนวณไม่ครบแสดง — ไม่แทนด้วยศูนย์</span>}</div>
        <OrderTable entries={data.entries} /><TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(page) => apply({ ...filters, page: String(page) })} onPageSize={(size) => apply({ ...filters, page: "1", pageSize: String(size) })} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </TopupInventoryPage>;
}
