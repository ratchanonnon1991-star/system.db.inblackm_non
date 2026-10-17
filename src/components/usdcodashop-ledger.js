"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Plus } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { CODA_BOUNDARY, CODA_OPENING } from "@/lib/usdcodashop-ledger";
import UsdCodashopSheetTable from "@/components/usdcodashop-sheet-table";

const endpoint = "/api/projectm/usdcodashop/ledger";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";

export default function UsdCodashopLedger({ lang }) {
  const [data, setData] = useState(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(CODA_OPENING); const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [deposit, setDeposit] = useState(null);
  const [observedAt, setObservedAt] = useState(null);
  const lock = useRef(false); const alive = useRef(false); const generation = useRef(0);
  const load = useCallback(async () => {
    const key = ++generation.current; setLoading(true); setError("");
    try {
      const result = await apiJson(`${endpoint}?${new URLSearchParams({ search, page: String(page) })}`, { cache: "no-store" });
      if (typeof result?.configured !== "boolean" || !Array.isArray(result.entries)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && key === generation.current) { setData(result); setObservedAt(Date.now()); }
    } catch (e) { if (alive.current && key === generation.current) setError(e.message); }
    finally { if (alive.current && key === generation.current) setLoading(false); }
  }, [search, page]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  useEffect(() => {
    if (!data?.configured || deposit) return;
    const timer = setInterval(() => { if (!document.hidden && !lock.current) load(); }, 30_000);
    return () => clearInterval(timer);
  }, [data?.configured, deposit, load]);
  async function mutate(body) {
    if (lock.current) return;
    lock.current = true; generation.current++; setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if ((body.action === "sync" && (!Number.isInteger(result?.added) || !Number.isInteger(result?.checked))) ||
          (body.action === "setup" && result?.configured !== true) || (body.action === "deposit" && !result?.id)) throw new Error("เซิร์ฟเวอร์ยืนยันไม่ครบ กรุณาโหลดประวัติก่อนทำรายการซ้ำ");
      if (!alive.current) return;
      setNotice(body.action === "sync" ? `ซิงก์แล้ว: เพิ่ม ${result.added} รายการ ตรวจ ${result.checked} รายการ (ไม่นับซ้ำ)` : "บันทึกแล้ว");
      setDeposit(null); await load();
    } catch (e) { if (alive.current) setError(e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const worker = data?.autoSync;
  const workerFresh = worker && observedAt - new Date(worker.heartbeat).getTime() < 180_000;
  const workerLabel = !worker ? "ยังไม่พบ worker" : !workerFresh ? "ไม่ได้รับสถานะเกิน 3 นาที โปรดตรวจ worker" :
    ({ ok: "ทำงานปกติ", syncing: "กำลังซิงก์", error: "ซิงก์ติดขัด", waiting: "รอยืนยันยอดยกมา", stopped: "หยุดทำงาน" }[worker.state] || "รอตรวจสอบ");
  return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY · SINGLE USD WALLET</p><h1 className="mt-2 text-3xl font-semibold">USDCodashop</h1><p className="mt-2 text-sm text-ll-ink-subtle">บัญชีเดียว · ประวัติรับเข้า–จ่ายออกจาก codashop_orders</p></div>
      <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
    </header>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลดประวัติ…</p>}
    {!data && !loading && <button onClick={load} className={button}>ลองโหลดใหม่</button>}
    {data && !data.configured && <section className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5">
      <h2 className="text-xl font-semibold">เริ่มบัญชี USDCodashop</h2>
      <p className="mt-3 text-sm leading-7 text-ll-ink-subtle">นับเฉพาะรายการ completed ที่ใช้ CodashopUSD และมีเลขรายการภายในหลัง {CODA_BOUNDARY} โดยไม่รวมรายการอ้างอิง ยอดคงเหลือหลักใช้ balance_after จากบอท ยอดยกมาเป็นข้อมูลบัญชีสำหรับตรวจสอบเท่านั้น ข้อมูลเดิมยังเก็บไว้โดยไม่แก้ไข</p>
      {data.canManage ? <form onSubmit={(e) => { e.preventDefault(); mutate({ action: "setup", boundary: CODA_BOUNDARY, opening, confirm: confirmed }); }} className="mt-5 space-y-4">
        <label className="block max-w-sm text-sm">ยอดยกมาหลัง {CODA_BOUNDARY} (USD)<input required inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={busy} className={input} /></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />ยืนยันยอดยกมาเป็นยอดหลังรายการนี้แล้ว และจะไม่เปลี่ยนยอดเริ่มต้นทับประวัติภายหลัง</label>
        <button disabled={busy || !confirmed} className={button}>ยืนยันเริ่มบัญชี</button>
      </form> : <p className="mt-4 text-sm">ให้ Projectm Admin ยืนยันยอดยกมาก่อนใช้งาน</p>}
    </section>}
    {data?.configured && <>
      <section aria-label="สรุปยอด USD" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["ยอดยกมา (บัญชี)", data.opening], ["USD เข้า (บันทึก)", data.deposits], ["USD ออก", data.used], ["USD คงเหลือ (บอท)", data.remaining]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4"><p className="text-sm text-ll-ink-subtle">{label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums">{money(value)}</p></div>)}
      </section>
      <p className="text-sm text-ll-ink-subtle">ยอดบอท ณ {date(data.balanceAsOf)}{data.balanceOrderId ? ` · Order ${data.balanceOrderId}` : ""} · คงเหลือตามบัญชี (ตรวจสอบ): {money(data.calculatedRemaining)} USD</p>
      {data.remaining == null && <p role="status" className="rounded-xl border border-ll-hairline p-4 text-sm">ยังไม่มี balance_after ที่ถูกต้องของ Order ล่าสุด ยอดคงเหลือหลักแสดง — ไม่ใช้ยอดคำนวณหรือยอดบอทของ Order เก่าแทน</p>}
      {data.remaining != null && Number(data.remaining) < 0 && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">ยอด balance_after จากบอทติดลบ กรุณาตรวจสอบต้นทาง</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || loading} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดประวัติ</button>
        {data.canManage && <><button disabled={busy || loading || Boolean(deposit)} onClick={() => mutate({ action: "sync" })} className={button}><RefreshCw size={16} aria-hidden />ซิงก์ Orders</button><button disabled={busy || Boolean(deposit)} onClick={() => { setDeposit({ amount: "", note: "", requestId: crypto.randomUUID() }); setError(""); }} className={button}><Plus size={16} aria-hidden />บันทึก USD เข้า</button></>}
        <p className="text-xs text-ll-ink-subtle">ซิงก์ล่าสุด: {date(data.lastSync)}</p>
      </div>
      <section aria-label="สถานะซิงก์อัตโนมัติ" className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-sm">
        <p className="font-medium">ซิงก์อัตโนมัติทุก 60 วินาที · {workerLabel}</p>
        <p className="mt-2 text-ll-ink-subtle">สำเร็จล่าสุด: {date(worker?.last_success)} · หน้านี้โหลดประวัติใหม่ทุก 30 วินาที (หยุดโหลดระหว่างกรอกเงินเข้า)</p>
        {worker?.error_message && <p role="alert" className="mt-2">{worker.error_message}</p>}
      </section>
      <p className="text-sm leading-6 text-ll-ink-subtle">USD คงเหลือใช้ balance_after จากบอทหลัง Order นั้น ส่วนยอดยกมา + USD เข้า − USD ออกเป็นยอดบัญชีสำหรับตรวจสอบ · ยอดบอทเป็นค่าที่บันทึก ณ เวลาทำรายการ ไม่ใช่ยอดสดจาก Codashop · worker ทำงานได้แม้ปิดเว็บ</p>
      {deposit && <form className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-5" onSubmit={(e) => { e.preventDefault(); mutate({ action: "deposit", ...deposit }); }}>
        <h2 className="text-lg font-semibold">บันทึก USD ที่เข้าบัญชีจริงแล้ว</h2>
        <p className="text-sm text-ll-ink-subtle">เป็นการบันทึกบัญชีเท่านั้น ไม่ใช่การโอนเงิน ลงวันที่ปัจจุบัน และไม่บวกทับ balance_after จากบอท ยอดบอทจะเปลี่ยนตามข้อมูลต้นทางเมื่อซิงก์</p>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><label className="text-sm">จำนวน USD<input autoFocus required inputMode="decimal" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} className={input} /></label><label className="text-sm">หมายเหตุ/เลขอ้างอิง<input required maxLength={300} value={deposit.note} onChange={(e) => setDeposit({ ...deposit, note: e.target.value })} className={input} /></label></fieldset>
        <div className="flex gap-3"><button disabled={busy} className={button}>ยืนยันบันทึก USD เข้า</button><button type="button" disabled={busy} onClick={() => setDeposit(null)} className={button}>ยกเลิก</button></div>
      </form>}
      <section className="min-w-0 space-y-4">
        <h2 className="text-xl font-semibold">ประวัติแบบชีท · หลัง {data.boundary}</h2>
        <p className="text-sm leading-6 text-ll-ink-subtle">ยอดโอนคือยอดขายจากลูกค้า ไม่ใช่ USD เติมเข้าบัญชี · ต้นทุน THB จาก inventory_transactions · กำไร = ยอดโอน − ต้นทุน และกำไร % = กำไร ÷ ยอดโอน × 100 (ไม่ใช่อัตราคงที่ 5%) · รายการต่างสกุลที่ยังไม่มีเรทจะแสดงยอดต้นทางและเว้นกำไรไว้</p>
        <p className="text-sm text-ll-ink-subtle">USD เข้าแสดงเฉพาะยอดที่บันทึกยืนยันในระบบนี้ ยังไม่เชื่อม prepayment ledger อัตโนมัติ สามารถบันทึกเงินเข้าที่ตรวจสอบแล้วด้วยปุ่มด้านบน</p>
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(query); }} className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">ค้นหา Order / เกม / แพ็ก / ผู้ทำรายการ<input value={query} onChange={(e) => setQuery(e.target.value)} className={input} /></label><button disabled={busy || loading} className={button}>ค้นหา</button></form>
        <p className="text-xs text-ll-ink-subtle">{data.total} รายการ · เลื่อนตารางแนวนอนเพื่อดูข้อมูลทั้งหมด · USD คงเหลือเป็นยอดบอทหลังแต่ละ Order ส่วนยอดสรุปใช้ Order ล่าสุด ไม่เปลี่ยนตามการค้นหาหรือเปลี่ยนหน้า</p>
        <UsdCodashopSheetTable entries={data.entries} emptyMessage={search ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีประวัติ กดซิงก์ Orders เพื่อดึงรายการ"} />
        <details className="text-sm"><summary className="cursor-pointer py-2">ดูตารางตรวจสอบบัญชี / Payment method</summary><div className="overflow-x-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
          <table className="w-full min-w-[1350px] text-left text-sm"><caption className="sr-only">บัญชี USDCodashop รับเข้า จ่ายออก และยอดคงเหลือจาก balance_after หน่วย USD</caption><thead className="bg-ll-surface-2"><tr>{["วันที่ (ไทย)", "Order / รายการ", "USD เข้า", "USD ออก", "USD คงเหลือ (บอท)", "เกม / แพ็ก", "ผู้ทำรายการ", "Payment method", "Transaction", "คงเหลือตามบัญชี (ตรวจสอบ)", "ผู้บันทึก"].map((v) => <th key={v} className="whitespace-nowrap px-4 py-3" scope="col">{v}</th>)}</tr></thead>
            <tbody>{data.entries.map((row) => <tr key={row.id} className="border-t border-ll-hairline"><td className="whitespace-nowrap px-4 py-3">{date(row.occurredAt)}</td><td className="max-w-64 break-words px-4 py-3"><span className="font-medium">{row.orderId}</span>{row.details.note && <p className="mt-1 text-xs text-ll-ink-subtle">{row.details.note}</p>}</td><td className="px-4 py-3 tabular-nums">{row.kind === "deposit" ? money(row.amount) : "—"}</td><td className="px-4 py-3 tabular-nums">{row.kind === "order" ? money(row.amount) : "—"}</td><td className="px-4 py-3 font-semibold tabular-nums">{money(row.balance)}</td><td className="max-w-64 break-words px-4 py-3">{row.details.game || "—"}<p className="mt-1 text-xs text-ll-ink-subtle">{row.details.pack}</p></td><td className="max-w-48 break-words px-4 py-3">{row.details.operator || row.recordedBy}</td><td className="px-4 py-3">{row.details.paymentMethod || "เติมเงิน"}</td><td className="max-w-64 break-words px-4 py-3">{row.details.invoice || "—"}</td><td className="px-4 py-3 tabular-nums">{money(row.calculatedBalance)}</td><td className="max-w-48 break-words px-4 py-3">{row.recordedBy}</td></tr>)}</tbody></table>
        </div></details>
        <nav aria-label="หน้าประวัติ" className="flex items-center justify-end gap-3 text-sm"><button disabled={busy || loading || page <= 1} onClick={() => setPage(page - 1)} className={button}>ก่อนหน้า</button><span>หน้า {page}</span><button disabled={busy || loading || page * 100 >= data.total} onClick={() => setPage(page + 1)} className={button}>ถัดไป</button></nav>
      </section>
    </>}
  </main>;
}
