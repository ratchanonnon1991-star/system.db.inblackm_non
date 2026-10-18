"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import ItuneImagePickerModal from "@/components/itune-image-picker-modal";
import { ITUNE_SHEET_SOURCES } from "@/lib/itune-sheet-orders";

// Shared by the admin "เช็คยอดจริง" page and the topup card (holders see only their own emails).
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) : "—";
const num = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// datetime-local works in the browser's clock; staff are in Thailand.
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function ItuneSheetOrderList({ entryId }) {
  const [orders, setOrders] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    apiJson(`/api/projectm/itune/${entryId}/sheet-orders`, { cache: "no-store" })
      .then((r) => { if (alive) setOrders(r.orders); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [entryId]);
  return <section className="min-w-0 space-y-2 text-sm text-ll-ink">
    <h3 className="font-semibold">ออเดอร์จากชีทที่หักเมลนี้ {orders ? `(${orders.length})` : ""}</h3>
    {error && <p role="alert">{error}</p>}
    {!orders && !error && <p role="status" className="text-ll-ink-subtle">กำลังโหลด…</p>}
    {orders?.length === 0 && <p className="text-ll-ink-subtle">ยังไม่มี</p>}
    <ul className="space-y-2">{orders?.map((o) => <li key={o.id} className="break-words rounded-lg border border-ll-hairline p-3">
      <p className="font-medium">{ITUNE_SHEET_SOURCES[o.source]?.label || o.source} · {o.order_id}</p>
      <p>ยอดออก {num(o.used_amount)} {o.currency} · ยอดเมล {num(o.amount_before)} → {num(o.amount_after)}</p>
      <p>ต้นทุน {o.cost_thb == null ? "ยังไม่ตั้งตัวคูณ" : `${num(o.cost_thb)} บาท (× ${Number(o.cost_rate)})`}</p>
      <p className="text-xs text-ll-ink-subtle">ชีทวันที่ {o.sheet_date}{o.order_time ? ` เวลา ${o.order_time}` : ""} · ย้ายเมื่อ {when(o.imported_at)}</p>
    </li>)}</ul>
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
