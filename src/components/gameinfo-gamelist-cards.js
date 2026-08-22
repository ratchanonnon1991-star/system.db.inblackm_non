"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleOff,
  Flag,
  Gamepad2,
  Menu,
  MoreVertical,
  Search,
  Send,
  Settings,
  Star,
  X,
} from "lucide-react";
import GameinfoDatasetToggle from "./gameinfo-dataset-toggle";
import GameinfoTutorialButton, { GameinfoDetailsButton } from "./gameinfo-tutorial-modal";
import {
  GAMEINFO_STATUSES,
  filterGameinfoRows,
  listGameinfoPublishers,
  listGameinfoTags,
  summarizeGameinfoRows,
  isGameinfoBotAuto,
} from "@/lib/gameinfo-dashboard";
import { gameinfoGameHref, gameinfoListHref, gameinfoPacksHref } from "@/lib/gameinfo-data-mode";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";

const PAGE_SIZE = 12;

const STATUS_STYLE = {
  online: { label: "พร้อมใช้งาน", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700" },
  review: { label: "ต้องตรวจสอบ", dot: "bg-linear-primary", badge: "bg-linear-primary/10 text-linear-primary" },
  partial: { label: "เปิดบางส่วน", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700" },
  offline: { label: "ปิดใช้งาน", dot: "bg-linear-ink-tertiary", badge: "bg-linear-surface-3 text-linear-ink-subtle" },
};

export default function GameinfoGamelistCards({ initial, initialReports = [], tagImages = {}, publisherImages = {}, editable = false, canReport = false, lang, dataMode = "uid" }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("");
  const [publisher, setPublisher] = useState("");
  const [sort, setSort] = useState("order");
  const [page, setPage] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(initial.filter((row) => row.isFavorite).map((row) => row.id)));
  const [reports, setReports] = useState(initialReports);
  const [favoriteBusy, setFavoriteBusy] = useState(null);
  const [reportGame, setReportGame] = useState(null);
  const [reportMessage, setReportMessage] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reportRefreshError, setReportRefreshError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    dialogRef: reportDialogRef,
    titleId: reportDialogTitleId,
    onBackdropMouseDown: onReportBackdropMouseDown,
  } = useGameinfoDialog({
    open: Boolean(reportGame),
    onRequestClose: () => {
      if (!reportSubmitting) setReportGame(null);
    },
  });
  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);
  useEffect(() => {
    if (!editable) return;
    const refreshReports = async () => {
      try {
        const response = await fetch("/api/gameinfo/reports");
        if (!response.ok) throw new Error();
        const data = await response.json();
        setReports(data.reports || []);
        setReportRefreshError("");
      } catch {
        setReportRefreshError("อัปเดต Report ไม่สำเร็จ — ระบบจะลองใหม่อัตโนมัติ");
      }
    };
    refreshReports();
    const timer = window.setInterval(refreshReports, 15_000);
    return () => window.clearInterval(timer);
  }, [editable]);
  const rowsWithState = useMemo(
    () => {
      const reportCounts = new Map();
      for (const report of reports) reportCounts.set(report.gameId, (reportCounts.get(report.gameId) || 0) + 1);
      return initial.map((row) => ({ ...row, isFavorite: favoriteIds.has(row.id), reportCount: reportCounts.get(row.id) || 0 }));
    },
    [favoriteIds, initial, reports]
  );
  const counts = useMemo(() => summarizeGameinfoRows(rowsWithState), [rowsWithState]);
  const tagOptions = useMemo(() => listGameinfoTags(initial), [initial]);
  const publisherOptions = useMemo(() => listGameinfoPublishers(initial), [initial]);
  const rows = useMemo(
    () => filterGameinfoRows(rowsWithState, { query, status, tag, publisher, sort }),
    [publisher, query, rowsWithState, sort, status, tag]
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const activeFilters = useMemo(() => {
    const items = [];
    if (query) items.push({ id: "query", label: `ค้นหา: ${query}` });
    if (status !== "all") items.push({ id: "status", label: STATUS_STYLE[status]?.label || status });
    if (tag) items.push({ id: "tag", label: `หมวดหมู่: ${tag}` });
    if (publisher) items.push({ id: "publisher", label: `ค่ายเกม: ${publisher}` });
    return items;
  }, [publisher, query, status, tag]);

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setTag("");
    setPublisher("");
    setPage(0);
  }

  function clearFilter(id) {
    if (id === "query") setQuery("");
    if (id === "status") setStatus("all");
    if (id === "tag") setTag("");
    if (id === "publisher") setPublisher("");
    setPage(0);
  }

  function chooseStatus(nextStatus) {
    setStatus(nextStatus);
    setPage(0);
    setSidebarOpen(false);
  }

  function chooseTag(nextTag) {
    setTag(nextTag);
    setPage(0);
    setSidebarOpen(false);
  }

  function choosePublisher(nextPublisher) {
    setPublisher(nextPublisher);
    setPage(0);
    setSidebarOpen(false);
  }

  async function toggleFavorite(row) {
    setFavoriteBusy(row.id);
    setActionError("");
    try {
      const response = await fetch(`/api/gameinfo/gamelist/${row.id}/favorite`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: !row.isFavorite }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกรายการโปรดไม่สำเร็จ");
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (data.favorite) next.add(row.id); else next.delete(row.id);
        return next;
      });
    } catch (error) {
      setActionError(error.message);
    } finally {
      setFavoriteBusy(null);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!reportGame) return;
    setReportSubmitting(true);
    setActionError("");
    try {
      const response = await fetch(`/api/gameinfo/gamelist/${reportGame.id}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: reportMessage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ส่งรายงานไม่สำเร็จ");
      setReports((current) => [data.report, ...current]);
      setQuery("");
      setTag("");
      setPublisher("");
      chooseStatus("review");
      setReportGame(null);
      setReportMessage("");
    } catch (error) {
      setActionError(error.message);
    } finally {
      setReportSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-65px)] lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex h-14 items-center border-b border-linear-hairline bg-linear-surface-2 px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="เปิดเมนูตัวกรอง"
          aria-controls="gameinfo-filter-sidebar"
          aria-expanded={sidebarOpen}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong bg-linear-surface-1 text-linear-ink transition hover:bg-linear-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-linear-primary/30"
        >
          <Menu size={20} />
        </button>
        <span className="ml-3 text-sm font-medium text-linear-ink">เมนูตัวกรอง</span>
        {activeFilters.length ? (
          <span className="ml-2 rounded-full bg-linear-primary px-2 py-0.5 text-[11px] font-semibold text-white" aria-label={`ใช้ตัวกรอง ${activeFilters.length} รายการ`}>
            {activeFilters.length}
          </span>
        ) : null}
      </div>

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="ปิดเมนูตัวกรอง"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-x-0 bottom-0 top-16 z-30 bg-linear-ink/35 lg:hidden"
        />
      ) : null}

      {/* The layout header is `sticky top-0 z-40` and 4rem tall, so the drawer
          starts below it (top-16) and stays under it (z-30) instead of sliding
          over the navbar. lg:static drops all of this back out on desktop. */}
      <aside
        id="gameinfo-filter-sidebar"
        className={`fixed bottom-0 left-0 top-16 z-30 w-[280px] overflow-y-auto border-r border-linear-hairline bg-linear-surface-2 p-4 transition-transform duration-200 ${
          sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        } lg:visible lg:static lg:w-auto lg:translate-x-0 lg:border-b-0`}
      >
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <span className="text-sm font-semibold text-linear-ink">ตัวกรองเกม</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="ปิดเมนูตัวกรอง"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-linear-primary/30"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="ตัวกรองเกม" className="lg:sticky lg:top-20">
          <button
            type="button"
            onClick={() => {
              clearFilters();
              setSidebarOpen(false);
            }}
            className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${
              status === "all" && !tag && !publisher
                ? "bg-linear-ink text-linear-canvas"
                : "text-linear-ink-subtle hover:bg-linear-surface-3"
            }`}
          >
            <span className="flex items-center gap-2"><Gamepad2 size={16} /> เกมทั้งหมด</span>
            <span className="text-xs opacity-70">{counts.all}</span>
          </button>

          <details open className="mt-3 border-t border-linear-hairline pt-3">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-linear-ink-muted">
              สถานะบริการ
            </summary>
            <div className="mt-1 space-y-1">
              {GAMEINFO_STATUSES.slice(1).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseStatus(item.id)}
                  className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${
                    status === item.id
                      ? "bg-linear-ink text-linear-canvas"
                      : "text-linear-ink-subtle hover:bg-linear-surface-3"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[item.id].dot}`} />
                    {item.label}
                  </span>
                  <span className="text-xs opacity-70">{counts[item.id]}</span>
                </button>
              ))}
            </div>
          </details>

          <details open className="mt-3 border-t border-linear-hairline pt-3">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-linear-ink-muted">
              หมวดหมู่
            </summary>
            {tagOptions.length ? (
              <div className="mt-1 space-y-1">
                {tagOptions.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => chooseTag(tag === item.name ? "" : item.name)}
                    className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${tag === item.name ? "bg-linear-ink text-linear-canvas" : "text-linear-ink-subtle hover:bg-linear-surface-3"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {tagImages[item.name] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tagImages[item.name]} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                      ) : null}
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="text-xs opacity-70">{item.count}</span>
                  </button>
                ))}
              </div>
            ) : <p className="px-3 py-2 text-xs text-linear-ink-tertiary">ยังไม่มีหมวดหมู่</p>}
          </details>

          <details open className="mt-3 border-t border-linear-hairline pt-3">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-linear-ink-muted">
              ค่ายเกม
            </summary>
            {publisherOptions.length ? (
              <div className="mt-1 space-y-1">
                {publisherOptions.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => choosePublisher(publisher === item.name ? "" : item.name)}
                    className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${publisher === item.name ? "bg-linear-ink text-linear-canvas" : "text-linear-ink-subtle hover:bg-linear-surface-3"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {publisherImages[item.name] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={publisherImages[item.name]} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                      ) : null}
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="text-xs opacity-70">{item.count}</span>
                  </button>
                ))}
              </div>
            ) : <p className="px-3 py-2 text-xs text-linear-ink-tertiary">ยังไม่มีค่ายเกม</p>}
          </details>

          <div className="mt-3 border-t border-linear-hairline pt-3">
            <button
              type="button"
              onClick={() => chooseStatus("favorite")}
              className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${
                status === "favorite"
                  ? "bg-linear-ink text-linear-canvas"
                  : "text-linear-ink-subtle hover:bg-linear-surface-3"
              }`}
            >
              <span className="flex items-center gap-2"><Star size={16} /> รายการโปรด</span>
              <span className="text-xs opacity-70">{counts.favorite}</span>
            </button>
            <button
              type="button"
              onClick={() => chooseStatus("bot-auto")}
              className={`mt-1 flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${
                status === "bot-auto"
                  ? "bg-linear-ink text-linear-canvas"
                  : "text-linear-ink-subtle hover:bg-linear-surface-3"
              }`}
            >
              <span className="flex items-center gap-2"><Bot size={16} /> Bot Auto</span>
              <span className="text-xs opacity-70">{counts.botAuto}</span>
            </button>
            {editable ? (
              <Link
                href={gameinfoListHref(lang, dataMode, true)}
                className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-linear-ink-subtle hover:bg-linear-surface-3"
              >
                <Settings size={16} /> ตั้งค่าระบบ
              </Link>
            ) : null}
          </div>
        </nav>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-linear-ink-tertiary">GAME DATABASE</p>
            <h1 className="text-[28px] font-semibold tracking-[-0.6px] text-linear-ink">คลังข้อมูลเกม</h1>
          </div>
          <GameinfoDatasetToggle basePath={`/gameinfo/${lang}`} />
        </div>
        {actionError ? <p role="alert" className="mb-4 text-sm text-linear-danger">{actionError}</p> : null}
        {reportRefreshError ? <p role="status" className="mb-4 text-sm text-linear-warning">{reportRefreshError}</p> : null}

        <section aria-label="สรุปสถานะเกม" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="เกมทั้งหมด" count={counts.all} icon={Gamepad2} active={status === "all"} onClick={() => chooseStatus("all")} />
          <StatCard label="พร้อมใช้งาน" count={counts.online} icon={CheckCircle2} active={status === "online"} onClick={() => chooseStatus("online")} tone="success" />
          <StatCard label="ต้องตรวจสอบ" count={counts.review} icon={AlertTriangle} active={status === "review"} onClick={() => chooseStatus("review")} tone="danger" />
          <StatCard label="ปิดใช้งาน" count={counts.offline} icon={CircleOff} active={status === "offline"} onClick={() => chooseStatus("offline")} />
        </section>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-linear-ink-tertiary" />
            <label htmlFor="gameinfo-game-search" className="sr-only">ค้นหาเกม</label>
            <input
              id="gameinfo-game-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="ค้นหาชื่อเกม, ID, Server, VPN..."
              className="h-10 w-full rounded-lg border border-linear-hairline-strong bg-linear-surface-1 pl-9 pr-10 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => clearFilter("query")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(0);
            }}
            aria-label="เรียงเกม"
            className="h-10 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-linear-primary"
          >
            <option value="order">ตามลำดับ</option>
            <option value="latest">ID ล่าสุด</option>
            <option value="name">ชื่อ A–Z</option>
          </select>
        </div>

        <div className="mb-4 flex min-h-7 flex-wrap items-center gap-2" aria-live="polite">
          <span className="mr-1 text-xs text-linear-ink-tertiary">พบ {rows.length} จาก {rowsWithState.length} เกม</span>
          {activeFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => clearFilter(filter.id)}
              className="inline-flex min-h-7 items-center gap-1 rounded-full border border-linear-hairline-strong bg-linear-surface-1 px-2.5 text-[11px] text-linear-ink-muted hover:border-linear-primary/40 hover:text-linear-ink"
              aria-label={`ยกเลิกตัวกรอง ${filter.label}`}
            >
              {filter.label}<X size={12} />
            </button>
          ))}
          {activeFilters.length > 1 ? (
            <button type="button" onClick={clearFilters} className="min-h-7 px-1 text-[11px] font-medium text-linear-primary hover:underline">
              ล้างทั้งหมด
            </button>
          ) : null}
        </div>

        {pageRows.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pageRows.map((row) => (
              <GameCard key={row.id} row={row} editable={editable} canReport={canReport} lang={lang} dataMode={dataMode} favoriteBusy={favoriteBusy === row.id} onToggleFavorite={toggleFavorite} onReport={() => {
                setActionError("");
                setReportGame(row);
                setReportMessage("");
              }} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-linear-hairline-strong px-4 py-16 text-center text-sm text-linear-ink-tertiary">
            <p>{status === "review" ? "ไม่มี Report ที่ต้องตรวจสอบ" : "ไม่พบเกมที่ตรงกับตัวกรอง"}</p>
            {activeFilters.length ? (
              <button type="button" onClick={clearFilters} className="mt-3 h-9 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink">
                ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        )}

        {pageCount > 1 ? (
          <div className="mt-6 flex items-center justify-end gap-1 text-sm text-linear-ink-subtle">
            <span className="mr-1 whitespace-nowrap">หน้า {currentPage + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage(0)} disabled={currentPage === 0} title="หน้าแรก" aria-label="หน้าแรก" className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong hover:bg-linear-surface-2 disabled:opacity-40"><ChevronsLeft size={16} /></button>
            <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0} title="หน้าก่อน" aria-label="หน้าก่อน" className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong hover:bg-linear-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage === pageCount - 1} title="หน้าถัดไป" aria-label="หน้าถัดไป" className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong hover:bg-linear-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
            <button type="button" onClick={() => setPage(pageCount - 1)} disabled={currentPage === pageCount - 1} title="หน้าสุดท้าย" aria-label="หน้าสุดท้าย" className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong hover:bg-linear-surface-2 disabled:opacity-40"><ChevronsRight size={16} /></button>
          </div>
        ) : null}
      </main>
      {reportGame ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={onReportBackdropMouseDown}>
          <form ref={reportDialogRef} tabIndex={-1} onSubmit={submitReport} role="dialog" aria-modal="true" aria-labelledby={reportDialogTitleId} className="w-full max-w-md rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5" style={{ boxShadow: "var(--ll-shadow-modal)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={reportDialogTitleId} className="text-lg font-semibold tracking-[-0.2px] text-linear-ink">รายงานปัญหา</h2>
                <p className="mt-1 text-xs text-linear-ink-tertiary">{reportGame.game} · ID {reportGame.id}</p>
              </div>
              <button type="button" disabled={reportSubmitting} onClick={() => setReportGame(null)} aria-label="ปิด" className="flex h-10 w-10 items-center justify-center rounded-lg text-linear-ink-tertiary hover:bg-linear-surface-2 disabled:opacity-40"><X size={18} /></button>
            </div>
            <textarea autoFocus required maxLength={1000} rows={4} value={reportMessage} onChange={(event) => setReportMessage(event.target.value)} placeholder="แจ้งข้อมูลที่ผิดหรือปัญหาที่พบ..." className="mt-4 min-h-28 w-full resize-y rounded-lg border border-linear-hairline-strong bg-linear-canvas px-3 py-2 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20" />
            {actionError ? <p role="alert" className="mt-2 text-xs text-linear-danger">{actionError}</p> : null}
            <button type="submit" disabled={reportSubmitting || !reportMessage.trim()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-linear-ink px-4 text-sm font-medium text-linear-canvas disabled:opacity-40"><Send size={15} /> {reportSubmitting ? "กำลังส่ง..." : "ส่งรายงาน"}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, count, icon: Icon, active, onClick, tone }) {
  const iconClass = tone === "success"
    ? "bg-linear-success-bg text-linear-success"
    : tone === "danger"
      ? "bg-linear-danger-bg text-linear-danger"
    : tone === "warning"
      ? "bg-linear-warning-bg text-linear-warning"
      : "bg-linear-surface-3 text-linear-ink-subtle";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border bg-linear-surface-1 p-4 text-left transition-colors hover:bg-linear-surface-2 ${active ? "border-linear-ink" : "border-linear-hairline"}`}
      style={{ boxShadow: "var(--ll-shadow-card)" }}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${iconClass}`}><Icon size={18} /></span>
      <span><span className="block text-xs text-linear-ink-subtle">{label}</span><strong className="text-xl font-semibold tracking-[-0.2px] text-linear-ink">{count}</strong></span>
    </button>
  );
}

function GameCard({ row, editable, canReport, lang, dataMode, favoriteBusy, onToggleFavorite, onReport }) {
  const status = STATUS_STYLE[row.serviceStatus] || STATUS_STYLE.online;
  const href = gameinfoGameHref(lang, row.id, dataMode);
  const packsHref = gameinfoPacksHref(lang, row.id, dataMode);
  const actionHref = gameinfoGameHref(lang, row.id, dataMode, editable);
  return (
    <article className="relative overflow-hidden rounded-2xl border border-linear-hairline bg-linear-surface-1" style={{ boxShadow: "var(--ll-shadow-card)" }}>
      <details className="group absolute right-3 top-3 z-20">
        <summary aria-label="เมนูเกม" title="เมนูเกม" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg bg-linear-surface-1/90 text-linear-ink-tertiary hover:bg-linear-surface-3 hover:text-linear-ink [&::-webkit-details-marker]:hidden">
          <MoreVertical size={18} />
        </summary>
        <div className="absolute right-0 mt-1 w-40 overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 py-1" style={{ boxShadow: "var(--ll-shadow-modal)" }}>
          <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onToggleFavorite(row); }} disabled={favoriteBusy} aria-pressed={row.isFavorite} className="flex h-10 w-full items-center gap-2 px-3 text-left text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40">
            <Star size={15} className={row.isFavorite ? "fill-current text-linear-ink" : ""} />
            {row.isFavorite ? "เอาออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
          </button>
          {canReport ? <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onReport(); }} className="flex h-10 w-full items-center gap-2 px-3 text-left text-xs text-linear-ink-muted hover:bg-linear-surface-2">
            <Flag size={15} /> รายงานปัญหา
          </button> : null}
          {editable ? <Link href={packsHref} className="flex h-10 items-center gap-2 px-3 text-xs text-linear-ink-muted hover:bg-linear-surface-2"><Settings size={15} /> แก้ไข Pack</Link> : null}
        </div>
      </details>
      <Link href={href} className="block p-4 hover:bg-linear-surface-2">
        <div className="flex gap-3">
          <div className="flex aspect-square w-[46%] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-primary">
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.image} alt="" className="h-full w-full object-cover" />
            ) : <Gamepad2 size={28} className="text-linear-ink-tertiary" />}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <h2 className="line-clamp-3 text-[17px] font-semibold uppercase leading-[1.25] tracking-[-0.25px] text-linear-ink">{row.game}</h2>
            <p className="mt-5 font-mono text-xs text-linear-ink-tertiary">ID: {row.id}</p>
            <p className="mt-3 flex items-center gap-2 text-xs text-linear-ink-subtle">
              <span className={`h-2 w-2 rounded-full ${status.dot}`} />{status.label}
            </p>
            <p className={`mt-2 inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${isGameinfoBotAuto(row.botManual) ? "bg-emerald-500/10 text-emerald-700" : "bg-linear-surface-2 text-linear-ink-muted"}`}>
              {row.botManual || "Manual"}
            </p>
            {row.reportCount > 0 ? <p className="mt-2 text-[11px] font-medium text-linear-primary">ต้องตรวจสอบ {row.reportCount}</p> : null}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Meta label="Region" value={row.region} />
          <Meta label="Platform" value={row.platform} />
          <Meta label="Server" value={row.server} />
        </dl>
      </Link>
      <div className="flex items-center gap-2 border-t border-linear-hairline p-3">
        <Link href={actionHref} className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-3 text-xs font-medium text-white ${editable ? "bg-linear-primary hover:bg-linear-primary-hover" : "bg-linear-ink"}`}>
          {editable ? "เปิดจัดการ" : "เปิดดู"}
        </Link>
        <GameinfoDetailsButton gameId={row.id} gameName={row.game} editable={false} hasTutorial={row.hasTutorial} hasVpnNote={row.hasVpnNote} dataMode={dataMode} compact />
        <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={false} hasData={row.hasWarning} variant="warning" dataMode={dataMode} compact />
      </div>
    </article>
  );
}

function Meta({ label, value }) {
  return (
    <div className="overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-1">
      <dt className="bg-linear-surface-2 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-linear-ink-subtle">
        {label}
      </dt>
      <dd className="truncate border-t border-linear-hairline px-2 py-2 text-sm font-medium text-linear-ink" title={value || "-"}>
        {value || "-"}
      </dd>
    </div>
  );
}
