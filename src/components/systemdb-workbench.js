"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Database, LayoutGrid, Loader2, Maximize2, Minimize2, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings2, Star, Sun, Table2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { initialWorkbenchView, normalizeWorkbenchPins, queriesInView, workbenchGrants } from "@/lib/systemdb-workbench";
import QueryPanel from "@/components/query-panel";
import SystemDbRowDetails from "@/components/systemdb-row-details";
import "./systemdb-workbench.css";

export default function SystemDbWorkbench({ me, initialViewId, onBackToMenu, onOpenBuilder }) {
  const [queries, setQueries] = useState([]);
  const [views, setViews] = useState([]);
  const [personalLayouts, setPersonalLayouts] = useState({});
  const [viewId, setViewId] = useState(null);
  const [queryId, setQueryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missingView, setMissingView] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [pins, setPins] = useState([]);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dark, setDark] = useState(false);
  const [detail, setDetail] = useState(null);
  const [drill, setDrill] = useState(null);
  const [help, setHelp] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const initialized = useRef(false);
  const helpRef = useRef(null);
  const helpOrigin = useRef(null);
  const openHelp = () => { helpOrigin.current = document.activeElement; setHelp(true); };
  const closeHelp = () => { setHelp(false); requestAnimationFrame(() => helpOrigin.current?.focus()); };
  const preferencesKey = `gamedb.workbench.v1.${me.id}`;
  const isTemplateUser = me.role === "user";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const update = () => setNarrow(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize pending state with a new authenticated API read
    setLoading(true); setError(""); setMissingView(false); initialized.current = false;
    Promise.all([
      apiJson("/api/queries", { signal: controller.signal, fallbackError: "โหลดรายการตารางไม่สำเร็จ" }),
      apiJson("/api/views", { signal: controller.signal, fallbackError: "โหลดเทมเพลตไม่สำเร็จ" }),
      isTemplateUser ? Promise.resolve({ layouts: {} }) : apiJson("/api/my-layouts", { signal: controller.signal }).catch(() => ({ layouts: {} })),
    ]).then(([queryData, viewData, personal]) => {
      if (!active) return;
      if (!Array.isArray(queryData.queries) || !Array.isArray(viewData.views)) throw new Error("ข้อมูลตารางหรือเทมเพลตไม่ครบ กรุณาลองใหม่");
      const list = queryData.queries, shared = viewData.views;
      let stored = {};
      try { stored = JSON.parse(window.localStorage.getItem(preferencesKey) || "{}") || {}; } catch { /* cosmetic preference */ }
      let view = initialWorkbenchView(shared, me, initialViewId);
      if (!initialViewId && !isTemplateUser && stored.viewId) view = shared.find((v) => Number(v.id) === Number(stored.viewId)) || view;
      const unavailable = Boolean(initialViewId && !view);
      const available = isTemplateUser && !view ? [] : queriesInView(list, view);
      setQueries(list); setViews(shared); setPersonalLayouts(personal.layouts || {}); setViewId(view?.id ?? null);
      setQueryId(unavailable ? null : available.find((q) => Number(q.id) === Number(stored.queryId))?.id ?? available[0]?.id ?? null);
      setMissingView(unavailable); setPins(normalizeWorkbenchPins(stored.pins, list));
      setCollapsed(Boolean(stored.collapsed));
      setDark(Boolean(stored.dark));
      initialized.current = true;
    }).catch((err) => { if (active && err.name !== "AbortError") setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
    // Account fields are primitive so a parent rerender cannot refetch a table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencesKey, me.role, me.defaultViewId, initialViewId, attempt]);
  useEffect(() => {
    if (!initialized.current || loading || error) return;
    try { window.localStorage.setItem(preferencesKey, JSON.stringify({ viewId, queryId, pins, collapsed, dark })); } catch { /* optional local preference */ }
  }, [viewId, queryId, pins, collapsed, dark, preferencesKey, loading, error]);
  useEffect(() => {
    const previous = document.documentElement.classList.contains("dark");
    return () => document.documentElement.classList.toggle("dark", previous);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  const activeView = views.find((v) => Number(v.id) === Number(viewId)) || null;
  const available = useMemo(() => isTemplateUser && !activeView ? [] : queriesInView(queries, activeView), [queries, activeView, isTemplateUser]);
  const selectedQuery = drill ? queries.find((q) => Number(q.id) === Number(drill.queryId)) : available.find((q) => Number(q.id) === Number(queryId));
  const viewPanel = activeView?.config?.panels?.find((p) => Number(p.queryId) === Number(selectedQuery?.id));
  const outsideView = Boolean(activeView && !viewPanel);
  const grants = outsideView ? { canWriteData: false, canUpdateData: false } : workbenchGrants(me, activeView);
  const panel = useMemo(() => selectedQuery ? { queryId: selectedQuery.id, collapsed: false, width: 1000, height: 600 } : null, [selectedQuery]);
  const clearDetail = useCallback(() => setDetail(null), []);
  const inspect = useCallback((row) => setDetail(row), []);
  const openDrill = useCallback((id, params) => { setDetail(null); setDrill({ queryId: id, params }); }, []);
  function chooseView(id) {
    const view = views.find((v) => Number(v.id) === Number(id)) || null;
    if (isTemplateUser && !view) return;
    setViewId(view?.id ?? null); setQueryId(queriesInView(queries, view)[0]?.id ?? null);
    setDetail(null); setDrill(null); setMissingView(false); setSidebarSearch(""); setOnlyPinned(false);
  }
  function chooseQuery(id) { setQueryId(id); setDetail(null); setDrill(null); setMissingView(false); }
  const filtered = available.filter((q) => (!onlyPinned || pins.includes(Number(q.id))) && `${q.name} ${q.description || ""}`.toLowerCase().includes(sidebarSearch.trim().toLowerCase()));
  const togglePin = (id) => setPins((old) => old.includes(Number(id)) ? old.filter((value) => value !== Number(id)) : [...old, Number(id)]);
  const templatePicker = <select aria-label="เลือกเทมเพลต" value={viewId ?? ""} onChange={(e) => chooseView(e.target.value)} disabled={loading}>{!isTemplateUser && <option value="">ตารางของฉัน</option>}{!views.length && isTemplateUser && <option value="">ยังไม่มีเทมเพลต</option>}{views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>;
  return <div className={`sdb-workbench ${collapsed ? "sdb-collapsed" : ""} ${expanded ? "sdb-expanded" : ""}`} data-theme={dark ? "dark" : "light"}>
    <a className="sdb-skip" href="#sdb-main">ข้ามไปตาราง</a>
    <header className="sdb-header" inert={help || (narrow && detail) ? true : undefined}><div className="sdb-brand"><button onClick={onBackToMenu} className="sdb-brand-mark" aria-label="กลับเมนูหลัก"><LayoutGrid size={20} /></button><strong>INBLACKM</strong><ChevronRight size={14} /><Database size={19} /><span>System DB</span></div><div className="sdb-header-actions"><button className="sdb-icon" aria-label={dark ? "ใช้โหมดสว่าง" : "ใช้โหมดมืด"} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button onClick={openHelp} className="sdb-header-help" aria-label="วิธีใช้"><BookOpen size={16} /><span>วิธีใช้</span></button><span className="sdb-avatar" title={me.displayName || me.username}>{String(me.displayName || me.username || "T").slice(0, 1).toUpperCase()}</span></div></header>
    <div className="sdb-body"><aside className="sdb-sidebar" aria-label="เทมเพลตและตาราง" inert={help || (narrow && detail) ? true : undefined}><div className="sdb-sidebar-top"><span>พื้นที่ทำงานของทีม</span><button className="sdb-icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div><p className="sdb-group-label">เทมเพลต</p><nav aria-label="เทมเพลต"><button className={`sdb-template ${!activeView ? "selected" : ""}`} onClick={() => chooseView("")} hidden={isTemplateUser} title="ตารางของฉัน" aria-current={!activeView ? "page" : undefined}><Table2 size={18} /><span>ตารางของฉัน</span><small>{queries.length}</small></button>{views.map((view) => <button key={view.id} className={`sdb-template ${activeView?.id === view.id ? "selected" : ""}`} title={view.name} onClick={() => chooseView(view.id)} aria-current={activeView?.id === view.id ? "page" : undefined}><Database size={18} /><span>{view.name}</span><small>{queriesInView(queries, view).length}</small></button>)}</nav>
      <div className="sdb-sidebar-divider" /><button className={`sdb-template ${onlyPinned ? "selected" : ""}`} title="ตารางที่ปักหมุด" aria-label="ตารางที่ปักหมุด" aria-pressed={onlyPinned} onClick={() => setOnlyPinned(!onlyPinned)}><Star size={17} /><span>ตารางที่ปักหมุด</span><small>{available.filter((q) => pins.includes(Number(q.id))).length}</small></button><p className="sdb-group-label">ตารางในเทมเพลต</p><label className="sdb-sidebar-search"><Search size={14} /><input aria-label="ค้นหาชื่อตาราง" placeholder="ค้นหาตาราง…" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} /></label>
      <div className="sdb-query-list">{loading ? <p className="sdb-sidebar-message"><Loader2 size={14} className="animate-spin" />กำลังโหลด…</p> : filtered.length ? filtered.map((query) => <div className={`sdb-query-item ${!drill && query.id === selectedQuery?.id ? "selected" : ""}`} key={query.id}><button title={query.name} onClick={() => chooseQuery(query.id)} aria-current={!drill && query.id === selectedQuery?.id ? "page" : undefined}><Table2 size={16} /><span>{query.name}</span></button><button className={`sdb-pin ${pins.includes(Number(query.id)) ? "pinned" : ""}`} aria-label={`${pins.includes(Number(query.id)) ? "เลิกปักหมุด" : "ปักหมุด"} ${query.name}`} aria-pressed={pins.includes(Number(query.id))} onClick={() => togglePin(query.id)}><Star size={14} fill={pins.includes(Number(query.id)) ? "currentColor" : "none"} /></button></div>) : <p className="sdb-sidebar-message">{sidebarSearch || onlyPinned ? "ไม่พบตารางตามตัวกรอง" : "ยังไม่มีตาราง"}</p>}</div>
      <div className="sdb-sidebar-bottom"><button onClick={openHelp}><BookOpen size={18} /><span><strong>เริ่มงานใน 3 ขั้นตอน</strong><small>เลือกเทมเพลต · ค้นหา · เปิดแถว</small></span></button>{!isTemplateUser && <button className="sdb-builder-link" onClick={onOpenBuilder}><Settings2 size={16} /><span>{me.role === "admin" ? "ตั้งค่าเทมเพลตและตาราง" : "เครื่องมือตารางเพิ่มเติม"}</span></button>}</div>
    </aside>
    <main id="sdb-main" className="sdb-main" tabIndex={-1} inert={help || (narrow && detail) ? true : undefined}><div className="sdb-mobile-picker"><span>เทมเพลต</span>{templatePicker}<ChevronDown size={14} /></div><div className="sdb-heading"><div><div className="sdb-eyebrow">SYSTEM DB<ChevronRight size={11} />{activeView?.name || "ตารางของฉัน"}</div><h1>{selectedQuery?.name || activeView?.name || "ตารางงาน"}</h1><p>{selectedQuery?.description || activeView?.description || "เลือกเทมเพลต ค้นหาข้อมูล และเปิดรายละเอียดโดยไม่ออกจากตาราง"}</p></div><div className="sdb-heading-actions">{drill && <button className="sdb-button" onClick={() => { setDrill(null); setDetail(null); }}>กลับตารางเดิม</button>}<button className="sdb-icon sdb-expand" aria-label={expanded ? "คืนหน้าจอปกติ" : "ขยายตารางเต็มพื้นที่"} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>{!isTemplateUser && <button className="sdb-icon sdb-builder-small" aria-label="เครื่องมือตารางเพิ่มเติม" onClick={onOpenBuilder}><Settings2 size={17} /></button>}</div></div>
      <div className="sdb-mobile-tables"><label>ตาราง<select aria-label="เลือกตาราง" value={selectedQuery?.id ?? ""} onChange={(e) => chooseQuery(Number(e.target.value))}>{!available.length && <option value="">ยังไม่มีตาราง</option>}{available.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select><ChevronDown size={13} /></label></div>
      {missingView && <p role="alert" className="sdb-error-banner">ไม่พบเทมเพลตที่ระบุ หรือบัญชีนี้เปิดเทมเพลตนั้นไม่ได้ กรุณาเลือกเทมเพลตจากรายการ</p>}
      {error ? <div role="alert" className="sdb-empty"><h2>โหลดรายการตารางไม่สำเร็จ</h2><p>{error}</p><button className="sdb-button" onClick={() => setAttempt((v) => v + 1)}>ลองโหลดใหม่</button></div> : loading ? <div className="sdb-empty" role="status"><Loader2 className="animate-spin" size={24} /><p>กำลังโหลดเทมเพลตและตาราง…</p></div> : selectedQuery ? <div className="sdb-table-host"><QueryPanel key={`${selectedQuery.id}:${activeView?.id || "own"}:${selectedQuery.updatedAt || ""}`} query={selectedQuery} queries={queries} panel={panel} layoutOverride={viewPanel?.layout || null}
        personalLayout={activeView ? null : personalLayouts[selectedQuery.id] || null} canManage={false} canCustomizeLayout={!isTemplateUser && !activeView?.isReadOnly && !outsideView} {...grants} activeViewId={activeView?.id ?? null} docked workbench canClose={false} isSelected={false} isFullWidth onInspectRow={inspect} onDataChange={clearDetail} onDrill={openDrill} initialParams={drill?.params || null} /></div> : <div className="sdb-empty"><Table2 size={30} /><h2>{isTemplateUser && !activeView ? "ยังไม่มีเทมเพลตสำหรับบัญชีนี้" : "เลือกตารางเพื่อเริ่มงาน"}</h2><p>{isTemplateUser && !activeView ? "โปรดแจ้งผู้ดูแลให้เตรียมเทมเพลตของทีม" : "เลือกเทมเพลตและตารางจากรายการด้านซ้าย"}</p></div>}
      <footer className="sdb-workspace-footer"><span>{activeView?.name || "พื้นที่ตารางส่วนตัว"}</span><span><kbd>/</kbd>ค้นหา<kbd>Esc</kbd>ปิดรายละเอียด</span></footer>
    </main>{detail && <SystemDbRowDetails key={`${detail.queryId}:${detail.sourceIndex}:${detail.asOf}`} row={detail} onClose={clearDetail} modal={narrow} />}</div>
    {help && <div className="sdb-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeHelp(); }}><section ref={helpRef} className="sdb-modal" role="dialog" aria-modal="true" aria-label="วิธีใช้ System DB" onKeyDown={(e) => { if (e.key === "Escape") closeHelp(); if (e.key === "Tab") { const buttons = helpRef.current.querySelectorAll("button"); if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1]?.focus(); } else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0]?.focus(); } } }}><header><h2>เริ่มงานใน System DB</h2><button className="sdb-icon" aria-label="ปิดวิธีใช้" onClick={closeHelp} autoFocus><X size={18} /></button></header><div className="sdb-modal-body"><ol><li><strong>เลือกเทมเพลตตามงาน</strong><p>รายการมาจากเทมเพลตที่ทีมเตรียมไว้</p></li><li><strong>ค้นหาและกรองข้อมูล</strong><p>ใช้ช่องค้นหา ชุดตัวกรอง หรือหัวคอลัมน์ในตาราง</p></li><li><strong>เปิดรายละเอียดแถว</strong><p>กดปุ่มรายละเอียดหน้าชื่อแถว แล้วดูข้อมูลหรือลิงก์ด้านข้างได้</p></li></ol><p>ใช้ / หรือ Ctrl K เพื่อค้นหา และ Esc เพื่อปิดรายละเอียด</p></div><footer><button className="sdb-button sdb-primary" onClick={closeHelp}>เริ่มใช้งาน</button></footer></section></div>}
  </div>;
}
