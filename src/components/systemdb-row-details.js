"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, ExternalLink, FileText, X } from "lucide-react";

export default function SystemDbRowDetails({ row, onClose, modal = false }) {
  const close = useRef(null);
  const host = useRef(null);
  const [tab, setTab] = useState("fields");
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const element = host.current;
    close.current?.focus();
    return () => { if (previous?.isConnected && (element?.contains(document.activeElement) || document.activeElement === document.body)) previous.focus(); };
  }, [row]);
  useEffect(() => {
    const key = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const links = row.fields.flatMap((f) => f.links.map((href) => ({ label: f.label, href })));
  async function copy() {
    try {
      await navigator.clipboard.writeText([row.title, ...row.fields.map((f) => `${f.label}: ${f.text || "—"}`)].join("\n"));
      setCopyStatus("คัดลอกแล้ว");
    } catch { setCopyStatus("คัดลอกไม่ได้ กรุณาเลือกข้อความที่ต้องการ"); }
  }
  const trapNarrowFocus = (event) => {
    if (event.key !== "Tab" || !window.matchMedia("(max-width: 1100px)").matches) return;
    const items = Array.from(host.current.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]'));
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <>
    <button className="sdb-detail-backdrop" aria-label="ปิดรายละเอียดแถว" onClick={onClose} />
    <aside className="sdb-detail" role={modal ? "dialog" : undefined} aria-modal={modal ? true : undefined} aria-label={`รายละเอียด ${row.title}`} ref={host} onKeyDown={trapNarrowFocus}>
      <div className="sdb-detail-top"><span><FileText size={15} />รายละเอียดแถว</span><button ref={close} aria-label="ปิดรายละเอียด" onClick={onClose} className="sdb-icon"><X size={18} /></button></div>
      <div className="sdb-detail-heading"><span className="sdb-eyebrow">{row.queryName}</span><h2>{row.title}</h2><p>ข้อมูลจากตารางที่กำลังเปิด</p></div>
      <div className="sdb-detail-tabs" role="tablist" aria-label="หมวดรายละเอียด">{[["fields", "ข้อมูลทั้งหมด"], ["links", "ลิงก์และคู่มือ"]].map(([id, label], index) => <button key={id} id={`sdb-detail-tab-${id}`} role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} aria-controls={`sdb-detail-${id}`} onClick={() => setTab(id)} onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const next = index ? "fields" : "links"; setTab(next); document.getElementById(`sdb-detail-tab-${next}`)?.focus(); } }}>{label}{id === "links" && <small>{links.length}</small>}</button>)}</div>
      <div className="sdb-detail-content" role="tabpanel" id={`sdb-detail-${tab}`} aria-labelledby={`sdb-detail-tab-${tab}`} tabIndex={0}>
        {tab === "fields" ? <><dl className="sdb-field-list">{row.fields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{field.text || "—"}</dd></div>)}</dl><button className="sdb-button sdb-copy" onClick={copy}><Copy size={15} />คัดลอกข้อมูลแถวนี้</button><p className="sdb-copy-status" role="status">{copyStatus && <><Check size={13} />{copyStatus}</>}</p></> : links.length ? <div className="sdb-detail-links">{links.map((link, i) => <a key={`${link.href}-${i}`} href={link.href} target="_blank" rel="noopener noreferrer"><BookOpen size={19} /><span><strong>{link.label}</strong><small>{new URL(link.href).hostname}</small></span><ExternalLink size={15} /></a>)}</div> : <div className="sdb-detail-empty"><BookOpen size={28} /><h3>ยังไม่มีลิงก์ในแถวนี้</h3><p>ลิงก์จะแสดงตามคอลัมน์ที่ตั้งไว้ในตาราง</p></div>}
      </div>
      <footer className="sdb-detail-footer"><span>{row.asOf ? `ข้อมูลเมื่อ ${new Date(row.asOf).toLocaleTimeString("th-TH")}` : "ข้อมูลจากผลลัพธ์ปัจจุบัน"}</span><button onClick={onClose}>กลับไปตาราง</button></footer>
    </aside>
  </>;
}
