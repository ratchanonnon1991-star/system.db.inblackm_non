"use client";

import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, ChevronDown, Download, ListFilter, Loader2, Plus, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";

export default function SystemDbQueryToolbar({ queryName, search, onSearch, filterViews, selectedViewId, onSelectView, onSaveView,
  columns, hidden, onToggleColumn, rowCount, loadedCount, running, refreshing, lastRunAt, onRefresh, onExport, hasResult,
  filters, onClearFilters, onOpenParams, onInsert, insertLabel, statusTabs, selectedStatuses = [], onSelectStatus }) {
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchInput = useRef(null);
  const modal = useRef(null);
  useEffect(() => {
    const key = (e) => { if ((e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable && !dialog) { e.preventDefault(); searchInput.current?.focus(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog]);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement;
    modal.current?.querySelector("input,button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [dialog]);
  const close = () => { if (!saving) { setDialog(null); setError(""); } };
  function modalKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key !== "Tab") return;
    const items = Array.from(modal.current.querySelectorAll("button:not([disabled]),input:not([disabled])"));
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
  return <>
    <div className="sdb-query-toolbar">
      <div className="sdb-search"><Search size={18} /><input ref={searchInput} aria-label={`ค้นหาในตาราง ${queryName}`} value={search} placeholder="ค้นหาเกม ช่องทาง หรือข้อมูลในตาราง…" onChange={(e) => onSearch(e.target.value)} />{search ? <button onClick={() => onSearch("")} aria-label="ล้างคำค้นหา"><X size={15} /></button> : <kbd>/</kbd>}</div>
      <label className="sdb-select"><ListFilter size={15} /><select aria-label="ชุดตัวกรองที่บันทึกไว้" value={selectedViewId} onChange={(e) => onSelectView(e.target.value)}><option value="">ทุกมุมมอง</option>{filterViews.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select><ChevronDown size={13} /></label>
      {onOpenParams && <button className="sdb-button" onClick={onOpenParams}><ListFilter size={15} />ตัวกรอง</button>}
      <button className="sdb-button" aria-label="คอลัมน์" onClick={() => setDialog("columns")} disabled={!columns.length}><SlidersHorizontal size={15} /><span>คอลัมน์</span></button>
      <button className="sdb-button" onClick={() => { setName(""); setError(""); setDialog("save"); }} aria-label="บันทึกมุมมอง"><BookmarkPlus size={15} /><span>บันทึกมุมมอง</span></button>
      <button className="sdb-icon" onClick={onRefresh} disabled={running || refreshing} aria-label="อัปเดตตาราง"><RefreshCw size={17} className={running || refreshing ? "animate-spin" : ""} /></button>
      <button className="sdb-button sdb-primary" onClick={onExport} disabled={!hasResult} aria-label="ส่งออกตาราง CSV"><Download size={15} /><span>ส่งออก</span></button>
      {onInsert && <button className="sdb-button" onClick={onInsert}><Plus size={15} />{insertLabel || "เพิ่มข้อมูล"}</button>}
    </div>
    <div className={`sdb-query-summary ${statusTabs ? "has-status-tabs" : ""}`}>
    {statusTabs && <nav className="sdb-status-tabs" aria-label="กรองตามสถานะ"><button aria-pressed={!selectedStatuses.length} onClick={() => onSelectStatus(null)}>ทั้งหมด <small>{loadedCount}</small></button>{statusTabs.options.map(({ label, count }) => <button key={label} aria-pressed={selectedStatuses.length === 1 && selectedStatuses[0] === label} onClick={() => onSelectStatus(label)}>{label} <small>{count}</small></button>)}</nav>}
    <div className="sdb-table-meta"><span>{running ? "กำลังโหลดตาราง…" : `${rowCount.toLocaleString("th-TH")} รายการ${rowCount !== loadedCount ? ` จาก ${loadedCount.toLocaleString("th-TH")} รายการที่โหลด` : ""}`}</span><span>{filters && <button onClick={onClearFilters}>ล้างตัวกรอง</button>}{lastRunAt && <small>อัปเดต {lastRunAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</small>}<small>กดรายละเอียดหน้าชื่อแถวเพื่อดูข้อมูล</small></span></div>
    </div>
    {dialog && <div className="sdb-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section ref={modal} role="dialog" aria-modal="true" aria-label={dialog === "columns" ? "คอลัมน์ในตาราง" : "บันทึกมุมมอง"} className="sdb-modal" onKeyDown={modalKey}>
      <header><h2>{dialog === "columns" ? "คอลัมน์ในตาราง" : "บันทึกมุมมอง"}</h2><button className="sdb-icon" aria-label="ปิดหน้าต่าง" disabled={saving} onClick={close}><X size={18} /></button></header>
      {dialog === "columns" ? <><div className="sdb-modal-body"><p>เลือกข้อมูลที่ใช้บ่อย การแสดงคอลัมน์ปรับได้เฉพาะหน้าที่เปิดอยู่</p><div className="sdb-column-options">{columns.map((c) => <label key={c.id}><input type="checkbox" checked={!hidden.includes(c.id)} disabled={!hidden.includes(c.id) && columns.filter((column) => !hidden.includes(column.id)).length <= 1} onChange={() => onToggleColumn(c.id)} />{c.label}</label>)}</div></div><footer><button className="sdb-button sdb-primary" onClick={close}><Check size={15} />เรียบร้อย</button></footer></> : <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) { setError("กรุณาตั้งชื่อมุมมอง"); return; } setSaving(true); setError(""); try { await onSaveView(name.trim()); setDialog(null); } catch (err) { setError(err.message); } finally { setSaving(false); } }}><div className="sdb-modal-body"><p>บันทึกคำค้นหา ชุดตัวกรอง และพารามิเตอร์ไว้ใช้ซ้ำกับตารางนี้</p><label className="sdb-form-label">ชื่อมุมมอง<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={saving} placeholder="เช่น รายการที่ทีมใช้ประจำ" aria-invalid={Boolean(error)} /></label>{error && <p role="alert" className="sdb-error">{error}</p>}</div><footer><button className="sdb-button" type="button" disabled={saving} onClick={close}>ยกเลิก</button><button className="sdb-button sdb-primary" type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <BookmarkPlus size={15} />}บันทึกมุมมอง</button></footer></form>}
    </section></div>}
  </>;
}
