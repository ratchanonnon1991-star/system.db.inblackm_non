"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Mail, Paperclip, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES, formatAttachmentSize } from "@/lib/stock-attachments";

// The files attached to one purchase order or wallet entry: slips, PDFs and the
// supplier's e-mail replies (an .eml file, or the reply's text pasted in).
// A screenshot can be pasted straight into the box with Ctrl+V.

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function TypeIcon({ contentType }) {
  if (contentType.startsWith("image/")) return <ImageIcon size={14} />;
  if (contentType === "message/rfc822") return <Mail size={14} />;
  return <FileText size={14} />;
}

export default function StockAttachments({ kind, ownerId, canEdit, currentUserId = null, title = "ไฟล์แนบ / อีเมล" }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pasting, setPasting] = useState(false);
  const [emailText, setEmailText] = useState("");
  const input = useRef(null);
  const url = `/api/stock/attachments?kind=${kind}&id=${ownerId}`;

  useEffect(() => {
    let live = true;
    apiJson(url, { fallbackError: "โหลดไฟล์แนบไม่สำเร็จ" })
      .then((data) => { if (live) setItems(data.attachments); })
      .catch((err) => { if (live) { setItems([]); setError(err.message); } });
    return () => { live = false; };
  }, [url]);

  async function upload(files) {
    const list = [...files].filter(Boolean);
    if (!list.length) return;
    const tooBig = list.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} ใหญ่เกิน ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const file of list) {
        const form = new FormData();
        form.set("kind", kind);
        form.set("id", String(ownerId));
        form.set("note", note);
        form.set("file", file, file.name || "screenshot.png");
        const data = await apiJson("/api/stock/attachments", { method: "POST", body: form, fallbackError: `แนบ ${file.name} ไม่สำเร็จ` });
        setItems((current) => [...(current || []), data.attachment]);
      }
      setNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function saveEmailText(event) {
    event.preventDefault();
    const text = emailText.trim();
    if (!text) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    await upload([new File([text], `อีเมล-${stamp}.txt`, { type: "text/plain" })]);
    setEmailText("");
    setPasting(false);
  }

  async function remove(item) {
    if (!window.confirm(`เอา ${item.fileName} ออกจากรายการนี้? (ไฟล์ยังเก็บไว้ในระบบพร้อมชื่อคนที่เอาออก)`)) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(`/api/stock/attachments/${item.id}`, { method: "DELETE", fallbackError: "เอาไฟล์ออกไม่สำเร็จ" });
      setItems((current) => current.filter((other) => other.id !== item.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onPaste(event) {
    if (!canEdit || pasting) return;
    const files = [...(event.clipboardData?.files || [])];
    if (!files.length) return;
    event.preventDefault();
    upload(files);
  }

  return (
    <div onPaste={onPaste} className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-zinc-700"><Paperclip size={14} /> {title}{items?.length ? ` (${items.length})` : ""}</p>
      {items === null ? (
        <p className="text-sm text-zinc-600"><Loader2 size={14} className="mr-1 inline animate-spin" />กำลังโหลด</p>
      ) : items.length ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-white px-3 py-2 text-[13px]">
              {item.contentType.startsWith("image/") ? (
                <a href={`/api/stock/attachments/${item.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/stock/attachments/${item.id}`} alt={item.fileName} className="h-12 w-12 rounded-lg object-cover ring-1 ring-zinc-200" />
                </a>
              ) : <span className="mt-0.5 shrink-0 text-zinc-500"><TypeIcon contentType={item.contentType} /></span>}
              <div className="min-w-0 flex-1">
                <a href={`/api/stock/attachments/${item.id}`} target="_blank" rel="noopener noreferrer" className="break-all font-extrabold text-[#B00004] hover:underline">{item.fileName}</a>
                <p className="text-xs text-zinc-600">{formatAttachmentSize(item.sizeBytes)} · {item.uploadedByName || "—"} · {formatTime(item.createdAt)}</p>
                {item.note ? <p className="text-xs text-zinc-700">{item.note}</p> : null}
              </div>
              {canEdit && currentUserId != null && String(item.uploadedById) === String(currentUserId) ? (
                <button type="button" onClick={() => remove(item)} disabled={busy} aria-label={`เอา ${item.fileName} ออก`} className="shrink-0 rounded-full p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-zinc-500">ยังไม่มีไฟล์แนบ</p>}

      {canEdit ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={(event) => upload(event.target.files)} disabled={busy} className="hidden" id={`attach-${kind}-${ownerId}`} />
            <label htmlFor={`attach-${kind}-${ownerId}`} className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-xs font-black text-white hover:bg-zinc-700 ${busy ? "pointer-events-none opacity-50" : ""}`}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} แนบไฟล์
            </label>
            <button type="button" onClick={() => setPasting((open) => !open)} className="flex h-9 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 text-xs font-black text-zinc-700 hover:bg-zinc-50">
              <Mail size={13} /> {pasting ? "ปิดช่องวางอีเมล" : "วางข้อความอีเมล"}
            </button>
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="หมายเหตุไฟล์ (ไม่บังคับ) เช่น สลิปโอน, ซัพตอบรับ" aria-label="หมายเหตุไฟล์" className="h-9 min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-3 text-xs outline-none focus:border-[#D90005]" />
          </div>
          {pasting ? (
            <form onSubmit={saveEmailText} className="flex flex-col gap-2">
              <textarea value={emailText} onChange={(event) => setEmailText(event.target.value)} rows={6} placeholder="วางอีเมลที่ซัพตอบมา (ผู้ส่ง วันที่ และเนื้อความ) จะเก็บเป็นไฟล์ .txt" aria-label="ข้อความอีเมล" className="w-full rounded-[10px] border border-zinc-300 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#D90005]" />
              <button type="submit" disabled={busy || !emailText.trim()} className="h-9 w-fit rounded-full bg-zinc-900 px-4 text-xs font-black text-white disabled:opacity-50">เก็บข้อความอีเมล</button>
            </form>
          ) : null}
          <p className="text-[11px] text-zinc-500">รูป (PNG, JPG, WEBP, GIF), PDF, อีเมล .eml หรือ .txt ไม่เกิน {MAX_ATTACHMENT_BYTES / 1024 / 1024} MB · วางภาพหน้าจอด้วย Ctrl+V ในกล่องนี้ได้</p>
        </div>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p> : null}
    </div>
  );
}
