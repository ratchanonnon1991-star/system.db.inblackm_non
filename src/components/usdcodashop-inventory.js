"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, RefreshCw, Pencil } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { USD_INVENTORY_STATUSES, USD_CODASHOP_SHEET_ROW, normalizeUsdInventory } from "@/lib/usdcodashop-inventory";

const endpoint = "/api/projectm/usdcodashop";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-1 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const money = (value) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function UsdCodashopInventory({ lang }) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""); const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(""); const [saving, setSaving] = useState(false);
  const lock = useRef(false); const latest = useRef(0); const alive = useRef(false); const formHeading = useRef(null);
  const load = useCallback(async () => {
    const request = ++latest.current; setLoading(true); setError("");
    try {
      const result = await apiJson(endpoint, { cache: "no-store" });
      if (!Array.isArray(result?.entries) || typeof result.canManage !== "boolean") throw new Error("ข้อมูล Inventory ไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && request === latest.current) setData(result);
    } catch (err) { if (alive.current && request === latest.current) { setError(err.message); setData(null); } }
    finally { if (alive.current && request === latest.current) setLoading(false); }
  }, []);
  const invalidateRead = useCallback(() => { latest.current++; }, []);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidateRead(); clearTimeout(timer); }; }, [load, invalidateRead]);
  const formKey = form?.id || form?.requestId;
  useEffect(() => { if (formKey) formHeading.current?.focus(); }, [formKey]);
  const open = (row) => {
    setForm(row ? { ...row } : { name: "", status: "ปกติ", current: "0.00", used: "0.00", requestId: crypto.randomUUID() });
    setFormError(""); setNotice("");
  };
  const save = async (event) => {
    event.preventDefault(); if (lock.current) return;
    let values;
    try { values = normalizeUsdInventory(form); } catch (err) { setFormError(err.message); return; }
    lock.current = true; setSaving(true); setFormError(""); latest.current++;
    try {
      const result = await apiJson(endpoint, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, id: form.id, version: form.version, requestId: form.requestId }) });
      if (!result?.entry?.id) throw new Error("เซิร์ฟเวอร์ยืนยันรายการไม่ครบ กรุณาโหลดใหม่ก่อนทำรายการซ้ำ");
      if (!alive.current) return;
      setForm(null); setNotice("บันทึกข้อมูลแล้ว"); await load();
    } catch (err) { if (alive.current) setFormError(err.status === 409 ? `${err.message} (ปิดฟอร์มแล้วกดโหลดใหม่)` : err.message); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  let remaining = "—";
  if (form) { try { remaining = money(normalizeUsdInventory({ ...form, name: form.name || "preview" }).remaining); } catch {} }
  const rows = (data?.entries || []).filter((row) => `${row.name} ${row.status} ${row.createdBy}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 px-4 pb-14 pt-10 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY · USD</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ll-ink">USDCodashop</h1><p className="mt-2 text-sm text-ll-ink-subtle">คงเหลือ = ปัจจุบัน − ใช้ไป · บันทึกยอดด้วยตนเอง ไม่หักยอดหรือเชื่อมผู้ให้บริการอัตโนมัติ</p></div>
      <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
    </header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="w-full min-w-0 text-sm text-ll-ink sm:w-auto sm:flex-1">ค้นหาไอดี/ผู้ลงรายการ<input value={search} onChange={(event) => setSearch(event.target.value)} className={input} /></label>
      <button type="button" disabled={loading || saving || Boolean(form)} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
      {data?.canManage && <button type="button" disabled={saving || Boolean(form)} onClick={() => open(null)} className={`${button} font-semibold`}><Plus size={16} aria-hidden />เพิ่มรายการ</button>}
      {data?.canManage && !loading && !data.entries.length && <button type="button" disabled={saving || Boolean(form)} className={button} onClick={() => { open(null); setForm({ ...USD_CODASHOP_SHEET_ROW, requestId: crypto.randomUUID(), fromSheet: true }); }}>เตรียมข้อมูลจากชีท</button>}
    </div>
    {notice && <p role="status" className="text-sm text-ll-ink">{notice}</p>}
    {error && <p role="alert" className="rounded-lg border border-ll-hairline p-4 text-sm text-ll-ink">{error}</p>}
    {form && <form onSubmit={save} className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-ll-ink">
      <h2 ref={formHeading} tabIndex={-1} className="text-lg font-semibold">{form.id ? "แก้ไขรายการ" : "เพิ่มรายการ USDCodashop"}</h2>
      {form.fromSheet && <p className="text-sm text-ll-ink-subtle">เตรียมเฉพาะ [BOT] (USD) Codashop จากยอดที่แจ้ง กรุณาตรวจสอบยอดล่าสุดก่อนกดบันทึก</p>}
      <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">ไอดี/ชื่อบัญชี<input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={input} /></label>
        <label className="text-sm">สถานะ<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={input}>{USD_INVENTORY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="text-sm">ปัจจุบัน (USD)<input required inputMode="decimal" value={form.current} onChange={(event) => setForm({ ...form, current: event.target.value })} className={input} /></label>
        <label className="text-sm">ใช้ไป (USD)<input required inputMode="decimal" value={form.used} onChange={(event) => setForm({ ...form, used: event.target.value })} className={input} /></label>
      </fieldset>
      <p className="text-sm">คงเหลือ: <strong>{remaining} USD</strong> · ผู้ลงรายการบันทึกจากบัญชีที่เข้าสู่ระบบ</p>
      {formError && <p role="alert" className="text-sm">{formError}</p>}
      <div className="flex gap-3"><button type="submit" disabled={saving} className={button}>{saving ? "กำลังบันทึก…" : "บันทึก"}</button><button type="button" disabled={saving} onClick={() => setForm(null)} className={button}>ยกเลิก</button></div>
    </form>}
    {loading ? <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลด…</p> : data && <>
      {!data.canManage && <p className="text-sm text-ll-ink-subtle">ดูข้อมูลได้ การเพิ่ม/แก้ไขต้องมีสิทธิ์ Projectm Admin</p>}
      <p className="text-xs text-ll-ink-subtle sm:hidden">เลื่อนตารางแนวนอนเพื่อดูยอดปัจจุบัน ใช้ไป คงเหลือ และปุ่มแก้ไข</p>
      <div className="overflow-x-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
        <table className="w-full min-w-[720px] text-left text-sm text-ll-ink"><caption className="sr-only">ยอดบัญชี USDCodashop หน่วย USD</caption><thead className="bg-ll-surface-2"><tr>{["ไอดี", "สถานะ", "ผู้ใช้งาน (ผู้ลงรายการ)", "ปัจจุบัน", "ใช้ไป", "คงเหลือ", "จัดการ"].map((name) => <th key={name} scope="col" className="px-4 py-3 font-semibold">{name}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-ll-hairline"><td className="max-w-72 break-words px-4 py-3 font-medium">{row.name}</td><td className="whitespace-nowrap px-4 py-3">{row.status}</td><td className="max-w-52 break-words px-4 py-3">{row.createdBy}</td><td className="px-4 py-3 tabular-nums">{money(row.current)}</td><td className="px-4 py-3 tabular-nums">{money(row.used)}</td><td className="px-4 py-3 font-semibold tabular-nums">{money(row.remaining)}</td><td className="px-4 py-3">{data.canManage && <button type="button" aria-label={`แก้ไข ${row.name}`} disabled={saving || Boolean(form)} className={button} onClick={() => open(row)}><Pencil size={15} aria-hidden />แก้ไข</button>}</td></tr>)}</tbody></table>
        {!rows.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">{search ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีข้อมูล เพิ่มรายการจากชีทได้ด้วยปุ่มเพิ่มรายการ"}</p>}
      </div>
      {data.hasMore && <p className="text-sm text-ll-ink-subtle">แสดงสูงสุด 1,000 รายการ</p>}
    </>}
  </main>;
}
