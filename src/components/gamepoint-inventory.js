"use client";
import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivCard, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { GAMEPOINT_RATE } from "@/lib/gamepoint-inventory";
import { ChannelReservations } from "@/components/inventory-reservations";
const endpoint = "/api/projectm/gamepoint";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่ระบุเวลา";
const source = (basis) => ({ "provider-lines": "ผลบอทครบทุกแพ็ก", "provider-invoice": "ผล invoice แพ็กเดียว", ledger: "ledger", conflict: "ยอดไม่ตรงกัน", mixed: "หลายแหล่งข้อมูล", unknown: "ข้อมูลไม่ครบ" })[basis] || "ข้อมูลไม่ครบ";
function History({ entries }) {
  return <div role="region" aria-label="ประวัติ Gamepoint" tabIndex={0} className={`${tivTableBox} max-h-[70vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[1250px]`}><caption className="sr-only">ยอดออกและคงเหลือ Gamepoint แยกยอดคำนวณจากยอดที่บันทึก</caption>
      <thead className="sticky top-0 z-10 backdrop-blur"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "MYR ออก (CostMYR)", "MYR คงเหลือ (คำนวณ)", "รายละเอียด"].map((h, i) => <th key={h} scope="col" className={i >= 2 && i <= 6 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.source}:${e.orderId}`}>
        <td className="whitespace-nowrap">{when(e.occurredAt)}</td>
        <td className="max-w-64 break-words"><span className="oid">{e.orderId}</span>{e.details.game}<span className="sm">{e.details.pack}</span><span className="sm">ผู้เติม: {e.details.sheetOperator || e.details.operator}</span></td>
        <td className="r">{money(e.figures.sale)}{e.fillCount > 1 && <span className="sm">รวมแล้ว ไม่คิดซ้ำ</span>}</td>
        <td className="r">{money(e.figures.cost)}<span className="sm">อ้างอิงเรท {e.details.costRate}</span></td>
        <td className="r"><span className={Number(e.figures.profit) > 0 ? "tiv-pos" : Number(e.figures.profit) < 0 ? "tiv-neg" : ""}>{money(e.figures.profit)}</span><span className="sm">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</span></td>
        <td className="r b max-w-64"><span>{money(e.used)}</span><span className="sm font-normal">{source(e.details.usageBasis)}</span>{e.details.usageWarning && <span className="tiv-subbox ml-auto block text-left font-normal">{e.details.usageWarning}</span>}</td>
        <td className="r b"><span>{money(e.wallet?.amount)}</span><span className="sm ml-auto max-w-48 font-normal">{e.wallet ? `ก่อน − ยอดตัด · ไม่ใช่ยอด API หลังเติม · ${when(e.wallet.checkedAt)}` : "ยังคำนวณยอดหลังไม่ได้"}</span></td>
        <td className="max-w-72 break-words"><details><summary>{e.fillCount} รายการย่อย</summary><div className="tiv-subbox"><p>ลูกค้า: {e.details.customer || "—"} · UID: {e.details.playerId || "—"}</p>
          <ul className="mt-2 space-y-2">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline pt-2"><p>คิว {f.id} · {f.details.pack}</p><p>ยอดออก {money(f.used)} MYR · {source(f.details.usageBasis)}</p><p>ยอดก่อนที่บันทึก {money(f.observation?.before)} MYR · {when(f.observation?.checkedAt)}</p><p>ยอดหลังคำนวณ {money(f.wallet?.amount)} MYR</p><p>ราคาตั้งต้น stored_cost {money(f.details.storedCostMyr)} MYR (ไม่ใช่ยอดตัด)</p><p className="break-all">ธุรกรรม {f.details.invoice || "—"}</p>{f.details.usageWarning && <p>{f.details.usageWarning}</p>}</li>)}</ul>
        </div></details></td>
      </tr>)}</tbody>
    </table>{!entries.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีรายการ</strong>ไม่พบรายการสำเร็จตามตัวกรอง</div>}
  </div>;
}
export default function GamepointInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), search: "", rate: GAMEPOINT_RATE, page: "1" }));
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
  return <TopupInventoryPage provider="gamepoint" description="ประวัติสำเร็จจากบอท · อ่านอย่างเดียว ไม่สั่งเติม ไม่หักยอดซ้ำ">
    <ChannelReservations lang={lang} channel="gamepoint" />
    <form aria-label="กรอง Gamepoint" className={tivCard} onSubmit={(e) => { e.preventDefault(); apply({ ...draft, page: "1" }); }}>
      <div className="tiv-tools">{quick.map(({ key, title, on }) => <button type="button" key={key} aria-pressed={on} className={`${button}${on ? " on" : ""}`} onClick={() => apply({ ...draft, ...codaQuickDates(key), page: "1" })}>{title}</button>)}</div>
      <div className="tiv-fields mt-4">{[["dateFrom", "วันที่เริ่มต้น", "date"], ["dateTo", "วันที่สิ้นสุด", "date"], ["search", "ค้นหา Order / เกม / ผู้เติม", "search"], ["rate", "เรทอ้างอิง THB ต่อ MYR", "number"]].map(([key, label, type]) => <label key={key} className={tivField}><span>{label}</span><input className={key === "rate" ? `${input} num` : input} type={type} required={key !== "search"} {...(key === "rate" ? { min: "0.00000001", max: "999999", step: "0.00000001" } : key === "search" ? { maxLength: 200 } : {})} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}</div>
      <div className="tiv-tools mt-4"><button type="submit" className={tivPrimary}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={load}>โหลดใหม่</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download>Export CSV</a>}</div>
      <p className="tiv-hint">เวลาไทย · ไม่เกิน 93 วัน · รวมทุกแพ็กของ Order ที่มีรายการในช่วงวันที่ แม้บางแพ็กอยู่นอกช่วง · เรทตั้งต้นจากชีท {GAMEPOINT_RATE} · เปลี่ยนเรทเฉพาะรายงาน/CSV ไม่แก้ฐานข้อมูล</p>
    </form>
    {error && <p role="alert" className="tiv-alert">{error}</p>}{loading && <p role="status" className="tiv-muted">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      <section aria-label="ยอดบอทและชีท" className="tiv-two">
        <article className="tiv-kpi"><small>ยอดก่อนรายการล่าสุดที่บอทบันทึก</small><b className={data.observation?.before == null ? "mut" : ""}>{money(data.observation?.before)} MYR</b><p className="break-all">{data.observation ? `${when(data.observation.checkedAt)} · ${data.observation.orderId}` : "ยังไม่มียอดก่อนรายการที่ยืนยัน"}</p><p>ไม่ใช่ยอดคงเหลือปัจจุบันหรือยอด API หลังเติม · ไม่เปลี่ยนตามตัวกรอง</p></article>
        <article className="tiv-kpi"><small>ยอดอ้างอิงจากชีท (แยกจากบอท)</small><dl className="mt-1 grid grid-cols-2 gap-3">{[["ยอดเริ่ม", data.reference.opening], ["คงเหลืออ้างอิง", data.reference.remaining]].map(([title, v]) => <div key={title} className="min-w-0"><dt className="text-xs text-ll-ink-subtle">{title}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{money(v)} MYR</dd></div>)}</dl><p>ไม่ใช่ยอดสด ไม่ได้นำมาหักยอดบอทซ้ำ และไม่ได้ยืนยันวันตัดยอด</p></article>
      </section>
      <p className="tiv-banner">CostMYR ใช้ยอดผลบอทครบทุกแพ็ก หรือ ledger ที่ตรวจสอบได้ ไม่ใช้ stored_cost แทนยอดตัด · ต้นทุน THB = MYR ออก × เรท · กำไร % = (ยอดโอน − ต้นทุน) ÷ ยอดโอน × 100 · ยอดคงเหลือในตารางเป็นยอดก่อน − ยอดตัด ไม่ใช่ยอด API หลังเติม และอาจต่างเมื่อมีรายการอื่นพร้อมกัน</p>
      <section aria-label="ผลการค้นหา" className="flex flex-col gap-4"><div className="tiv-sect-h"><h2>ประวัติ Gamepoint · {data.total} ออเดอร์ · {data.summary.fills} รายการย่อย</h2></div>
        <dl className="tiv-kpis">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB (อ้างอิง)", data.summary.cost], ["กำไร THB (อ้างอิง)", data.summary.profit], ["MYR ออก", data.summary.used]].map(([title, v]) => <div key={title} className="tiv-kpi"><dt>{title}</dt><dd className={v == null ? "mut" : ""}>{money(v)}</dd></div>)}</dl>
        <div className="tiv-foots">{(data.summary.missingSales > 0 || data.summary.missingUsage > 0 || data.summary.missingCosts > 0) && <span role="status">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ยอดออก {data.summary.missingUsage} · ต้นทุน {data.summary.missingCosts} รายการ · ยอดรวมที่ไม่ครบแสดง — ไม่แทนด้วยศูนย์</span>}
          <span>เลื่อนตารางแนวนอนเพื่อดูครบทุกคอลัมน์ · เลข Order เดียวกันรวมยอดโอนครั้งเดียวตามสัดส่วนรายการย่อย · ยอดคงเหลือไม่รวมบวกกัน</span></div><History entries={data.entries} />
        <TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(page) => apply({ ...filters, page: String(page) })} onPageSize={(size) => apply({ ...filters, page: "1", pageSize: String(size) })} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </TopupInventoryPage>;
}
