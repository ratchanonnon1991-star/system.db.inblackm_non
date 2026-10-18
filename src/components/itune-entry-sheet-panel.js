"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import ItuneImagePickerModal from "@/components/itune-image-picker-modal";
import { itunesSourceLabel } from "@/lib/itune-sheet-orders";
import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";

// Shared by the admin "เช็คยอดจริง" page and the topup card (holders see only their own emails).
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) : "—";
const num = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// datetime-local works in the browser's clock; staff are in Thailand.
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

const cell = "border-r border-ll-hairline px-3 py-2 align-top";
const money2 = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Coda-style order table (sale, cost, profit, game, customer…), shared with the admin page.
export function ItuneOrdersTable({ rows, showEmail = false, onDelete, onEdit, editedIds, busy, emptyMessage = "ยังไม่มีออเดอร์" }) {
  const headings = ["วันที่ / เวลา", "ลำดับคิว", "ที่มา", ...(showEmail ? ["เมล"] : []), "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "กำไร (%)",
    "ยอดออก", "ยอดเมล ก่อน → หลัง", "ชื่อลูกค้า", "ลิงก์", "เกม", "สิ่งที่ซื้อ", "UID", "หมายเหตุ / ผู้เพิ่ม", ...(onDelete || onEdit ? [""] : [])];
  return <div className="max-h-[60vh] overflow-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
    <table className="w-full min-w-[1700px] text-left text-sm text-ll-ink">
      <thead className="sticky top-0 z-10 bg-ll-surface-2"><tr>{headings.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap border-r border-ll-hairline px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((o) => {
        const f = sheetFigures({ saleThb: o.sale_thb, costThb: o.cost_thb }); const link = orderLink(o.link);
        return <tr key={o.id} className="border-t border-ll-hairline hover:bg-ll-surface-2">
          <td className={`${cell} whitespace-nowrap`}>{o.sheet_date}{o.order_time ? <p className="text-xs text-ll-ink-subtle">{o.order_time}</p> : null}</td>
          <td className={`${cell} break-words font-medium`}>{o.order_id}</td>
          <td className={`${cell} whitespace-nowrap`}>{itunesSourceLabel(o.source)}</td>
          {showEmail && <td className={`${cell} break-all`}>{o.email}</td>}
          <td className={`${cell} tabular-nums`}>{money2(o.sale_thb)}</td>
          <td className={`${cell} tabular-nums`}>{o.cost_thb == null ? "ยังไม่ตั้ง" : money2(o.cost_thb)}{o.cost_rate && <p className="text-xs text-ll-ink-subtle">× {Number(o.cost_rate)}</p>}</td>
          <td className={`${cell} tabular-nums ${f.profit != null && Number(f.profit) < 0 ? "text-ll-primary-subtle-text" : ""}`}>{money2(f.profit)}</td>
          <td className={`${cell} tabular-nums`}>{f.margin == null ? "—" : `${f.margin}%`}</td>
          <td className={`${cell} whitespace-nowrap tabular-nums`}>{money2(o.used_amount)} {o.currency}{editedIds?.has(String(o.id)) && <p className="text-xs text-ll-ink-subtle">แก้ไขแล้ว</p>}</td>
          <td className={`${cell} whitespace-nowrap tabular-nums`}>{money2(o.amount_before)} → {money2(o.amount_after)}</td>
          <td className={`${cell} max-w-48 break-words`}>{o.customer || "—"}</td>
          <td className={cell}>{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">เปิด</a> : "—"}</td>
          <td className={`${cell} max-w-48 break-words`}>{o.game || "—"}</td>
          <td className={`${cell} max-w-56 break-words`}>{o.pack || "—"}</td>
          <td className={`${cell} max-w-48 break-words`}>{o.player_id || "—"}</td>
          <td className={`${cell} max-w-56 break-words text-xs`}>{o.note || ""}{o.created_by_username ? <p className="text-ll-ink-subtle">เพิ่มโดย {o.created_by_username}</p> : null}</td>
          {(onDelete || onEdit) && <td className={`${cell} whitespace-nowrap`}>
            {onEdit && <button type="button" onClick={() => onEdit(o)} disabled={busy} aria-label={`แก้ยอดออก ${o.order_id}`} title="แก้ยอดออก" className="rounded-lg p-2 hover:bg-ll-surface-2 disabled:opacity-50"><Pencil size={16} aria-hidden /></button>}
            {onDelete && <button type="button" onClick={() => onDelete(o)} disabled={busy} aria-label={`ลบออเดอร์ ${o.order_id}`} title="ลบออเดอร์" className="rounded-lg p-2 hover:bg-ll-surface-2 disabled:opacity-50"><Trash2 size={16} aria-hidden /></button>}
          </td>}
        </tr>;
      })}</tbody>
    </table>
    {!rows.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">{emptyMessage}</p>}
  </div>;
}

function sumOf(rows, key) {
  if (rows.some((r) => r[key] == null)) return null;
  return rows.reduce((t, r) => t + Math.round(Number(r[key]) * 100), 0) / 100;
}

const blankOrder = () => ({ orderId: "", usedAmount: "", saleThb: "", orderAt: localNow(), game: "", pack: "", customer: "", link: "", playerId: "", note: "" });

export function ItuneSheetOrderList({ entryId, currency }) {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false); const [form, setForm] = useState(null); const [edit, setEdit] = useState(null);
  const load = useCallback(async () => {
    try { setData(await apiJson(`/api/projectm/itune/${entryId}/sheet-orders`, { cache: "no-store" })); }
    catch (e) { setError(e.message); }
  }, [entryId]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  async function add(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiJson(`/api/projectm/itune/${entryId}/sheet-orders`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, orderAt: new Date(form.orderAt).toISOString() }) });
      setForm(null); setNotice("เพิ่มออเดอร์และหักยอดเมลแล้ว"); await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveEdit(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiJson(`/api/projectm/itune/sheet-orders/${edit.order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usedAmount: edit.amount, reason: edit.reason }) });
      setNotice(`แก้ยอดออก ${edit.order.order_id} เป็น ${edit.amount} แล้ว ยอดเมลปรับตามส่วนต่าง`); setEdit(null); await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function remove(order) {
    if (!window.confirm(`ลบออเดอร์ ${order.order_id}? ยอด ${order.used_amount} ${order.currency} จะคืนเข้าเมล`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await apiJson(`/api/projectm/itune/sheet-orders/${order.id}`, { method: "DELETE" }); setNotice("ลบออเดอร์และคืนยอดแล้ว"); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const orders = data?.orders || [];
  const totals = { sale: sumOf(orders, "sale_thb"), cost: sumOf(orders, "cost_thb") };
  return <section className="min-w-0 space-y-3 text-sm text-ll-ink">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">ออเดอร์ที่หักเมลนี้ {data ? `(${orders.length})` : ""}</h3>
      {!form && <button type="button" onClick={() => setForm({ ...blankOrder(), requestId: crypto.randomUUID() })} disabled={busy} className={button}><Plus size={16} aria-hidden />เพิ่มออเดอร์เอง</button>}
    </div>
    {data && orders.length > 0 && <p className="text-xs text-ll-ink-subtle">รวมยอดโอน {money2(totals.sale)} · ต้นทุน {money2(totals.cost)} · กำไร {totals.sale == null || totals.cost == null ? "—" : money2(totals.sale - totals.cost)} บาท{totals.sale == null || totals.cost == null ? " (มีออเดอร์ที่ข้อมูลไม่ครบ)" : ""}</p>}
    {form && <form onSubmit={add} className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <p className="text-xs text-ll-ink-subtle">หักยอดเมลทันที ต้นทุนใช้ตัวคูณ {currency || ""} ณ ตอนนี้</p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>เลขออเดอร์ *<input required maxLength={128} value={form.orderId} onChange={set("orderId")} className={input} /></label>
        <label>ยอดออก ({currency || "สกุลเมล"}) *<input required inputMode="decimal" value={form.usedAmount} onChange={set("usedAmount")} className={input} /></label>
        <label>วันที่และเวลา *<input required type="datetime-local" max={localNow()} value={form.orderAt} onChange={set("orderAt")} className={input} /></label>
        <label>ยอดโอน (THB)<input inputMode="decimal" value={form.saleThb} onChange={set("saleThb")} className={input} /></label>
        <label>เกม<input maxLength={200} value={form.game} onChange={set("game")} className={input} /></label>
        <label>สิ่งที่ซื้อ<input maxLength={300} value={form.pack} onChange={set("pack")} className={input} /></label>
        <label>ชื่อลูกค้า<input maxLength={200} value={form.customer} onChange={set("customer")} className={input} /></label>
        <label>ลิงก์<input type="url" maxLength={500} value={form.link} onChange={set("link")} className={input} /></label>
        <label>UID<input maxLength={200} value={form.playerId} onChange={set("playerId")} className={input} /></label>
        <label className="sm:col-span-2 lg:col-span-3">หมายเหตุ<input maxLength={500} value={form.note} onChange={set("note")} className={input} /></label>
      </fieldset>
      <div className="flex gap-3"><button disabled={busy} className={button}>บันทึกและหักยอด</button><button type="button" disabled={busy} onClick={() => setForm(null)} className={button}>ยกเลิก</button></div>
    </form>}
    {edit && <form onSubmit={saveEdit} className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <p className="font-medium">แก้ยอดออก ออเดอร์ {edit.order.order_id} (เดิม {money2(edit.order.used_amount)} {edit.order.currency})</p>
      <p className="text-xs text-ll-ink-subtle">ยอดเมลจะเพิ่ม/ลดตามส่วนต่าง ต้นทุนคิดใหม่ด้วยตัวคูณเดิมของออเดอร์นี้ และเก็บประวัติการแก้ไว้</p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label>ยอดออกใหม่ ({edit.order.currency}) *<input required autoFocus inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} className={input} /></label>
        <label>เหตุผล<input maxLength={500} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} className={input} /></label>
      </fieldset>
      <div className="flex gap-3"><button disabled={busy || !edit.amount} className={button}>บันทึก</button><button type="button" disabled={busy} onClick={() => setEdit(null)} className={button}>ยกเลิก</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status" className="text-ll-ink-subtle">กำลังโหลด…</p>}
    {data && <ItuneOrdersTable rows={orders} onDelete={remove} busy={busy} editedIds={new Set((data.edits || []).map((e) => String(e.import_id)))}
      onEdit={(o) => { setForm(null); setError(""); setNotice(""); setEdit({ order: o, amount: String(Number(o.used_amount)), reason: "" }); }} />}
    {data?.edits?.length > 0 && <details><summary className="cursor-pointer py-2">ประวัติการแก้ยอดออก ({data.edits.length})</summary>
      <ul className="mt-2 space-y-1 text-xs text-ll-ink-subtle">{data.edits.map((e) => <li key={e.id}>
        {e.order_id} · {money2(e.old_amount)} → {money2(e.new_amount)} · {e.edited_by_username || "—"} เมื่อ {when(e.edited_at)}{e.reason ? ` · ${e.reason}` : ""}
      </li>)}</ul></details>}
    {data?.deleted.length > 0 && <details><summary className="cursor-pointer py-2">ประวัติการลบออเดอร์ ({data.deleted.length})</summary>
      <ul className="mt-2 space-y-1 text-xs text-ll-ink-subtle">{data.deleted.map((o) => <li key={o.id}>
        {itunesSourceLabel(o.source)} · {o.order_id} · {money2(o.used_amount)} {o.currency} (คืนยอดแล้ว) · ลบโดย {o.deleted_by_username || "—"} เมื่อ {when(o.deleted_at)}
      </li>)}</ul></details>}
  </section>;
}

function PhotoImage({ id }) {
  const [src, setSrc] = useState(""); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    apiJson(`/api/projectm/itune/balance-photos/${id}`).then((r) => { if (alive) setSrc(r.image); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id]);
  if (failed) return <p className="text-xs text-ll-ink-subtle">โหลดรูปไม่สำเร็จ</p>;
  if (!src) return <div className="h-40 w-full animate-pulse rounded-lg bg-ll-surface-2" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="รูปยอดคงเหลือในเมล" className="max-h-80 w-full rounded-lg border border-ll-hairline object-contain" /></a>;
}

export function ItuneBalancePhotos({ entryId, onChanged }) {
  const [data, setData] = useState(null); const [image, setImage] = useState(""); const [takenAt, setTakenAt] = useState(localNow);
  const [picker, setPicker] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try { setData(await apiJson(`/api/projectm/itune/balance-photos?entryId=${entryId}`, { cache: "no-store" })); }
    catch (e) { setError(e.message); }
  }, [entryId]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiJson("/api/projectm/itune/balance-photos", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, image, takenAt: new Date(takenAt).toISOString() }) });
      setImage(""); setTakenAt(localNow()); setNotice("บันทึกรูปแล้ว"); await load(); onChanged?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm("ลบรูปนี้? (จะเก็บไว้ในประวัติการลบ)")) return;
    setBusy(true); setError(""); setNotice("");
    try { await apiJson(`/api/projectm/itune/balance-photos/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="min-w-0 space-y-3 text-sm text-ll-ink">
    <h3 className="font-semibold">รูปยอดคงเหลือจริง {data ? `(${data.photos.length})` : ""}</h3>
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <button type="button" onClick={() => setPicker(true)} disabled={busy} className={button}><ImagePlus size={16} aria-hidden />{image ? "เปลี่ยนรูป" : "เลือก/วางรูป"}</button>
      <label className="text-sm">วันที่และเวลาของรูป<input required type="datetime-local" max={localNow()} value={takenAt} onChange={(e) => setTakenAt(e.target.value)} className={input} /></label>
      <button disabled={busy || !image || !takenAt} className={button}>บันทึกรูป</button>
    </form>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image && <img src={image} alt="ตัวอย่างรูปที่จะบันทึก" className="max-h-60 rounded-lg border border-ll-hairline object-contain" />}
    {picker && <ItuneImagePickerModal value={image} onChange={setImage} onClose={() => setPicker(false)} />}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status" className="text-ll-ink-subtle">กำลังโหลด…</p>}
    {data?.photos.length === 0 && <p className="text-ll-ink-subtle">ยังไม่มีรูป</p>}
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">{data?.photos.map((p) => <li key={p.id} className="space-y-2 rounded-xl border border-ll-hairline bg-ll-surface-1 p-3">
      <PhotoImage id={p.id} />
      <p className="font-medium">{when(p.taken_at)}</p>
      <p className="text-xs text-ll-ink-subtle">ยอดในเว็บตอนบันทึก {num(p.system_amount)} {p.currency || ""} · {p.created_by_username || "—"} · บันทึก {when(p.created_at)}</p>
      <button type="button" onClick={() => remove(p.id)} disabled={busy} className={button}><Trash2 size={16} aria-hidden />ลบรูป</button>
    </li>)}</ul>
    {data?.deleted.length > 0 && <details><summary className="cursor-pointer py-2">ประวัติการลบ ({data.deleted.length})</summary>
      <ul className="mt-2 space-y-1 text-xs text-ll-ink-subtle">{data.deleted.map((p) => <li key={p.id}>
        รูปวันที่ {when(p.taken_at)} (เพิ่มโดย {p.created_by_username || "—"}) · ลบโดย {p.deleted_by_username || "—"} เมื่อ {when(p.deleted_at)}
      </li>)}</ul></details>}
  </section>;
}
