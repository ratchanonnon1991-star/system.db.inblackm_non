"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Flag,
  Gamepad2,
  MoreVertical,
  Search,
  Send,
  Settings,
  Star,
  X,
} from "lucide-react";
import GameinfoDatasetToggle from "./gameinfo-dataset-toggle";
import GameinfoTutorialButton from "./gameinfo-tutorial-modal";
import {
  GAMEINFO_STATUSES,
  filterGameinfoRows,
  listGameinfoTags,
  summarizeGameinfoRows,
  isGameinfoBotAuto,
} from "@/lib/gameinfo-dashboard";

const PAGE_SIZE = 12;

const STATUS_STYLE = {
  online: { label: "พร้อมใช้งาน", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700" },
  review: { label: "ต้องตรวจสอบ", dot: "bg-linear-primary", badge: "bg-linear-primary/10 text-linear-primary" },
  partial: { label: "เปิดบางส่วน", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700" },
  offline: { label: "ปิดใช้งาน", dot: "bg-linear-ink-tertiary", badge: "bg-linear-surface-3 text-linear-ink-subtle" },
};

export default function GameinfoGamelistCards({ initial, initialReports = [], editable = false, lang, dataMode = "uid" }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("order");
  const [page, setPage] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(initial.filter((row) => row.isFavorite).map((row) => row.id)));
  const [reports, setReports] = useState(initialReports);
  const [favoriteBusy, setFavoriteBusy] = useState(null);
  const [reportBusy, setReportBusy] = useState(null);
  const [reportGame, setReportGame] = useState(null);
  const [reportMessage, setReportMessage] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reportRefreshError, setReportRefreshError] = useState("");
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
  const rows = useMemo(
    () => filterGameinfoRows(rowsWithState, { query, status, tag, sort }),
    [query, rowsWithState, sort, status, tag]
  );
  const reportRows = useMemo(() => {
    const gameById = new Map(rowsWithState.map((row) => [row.id, row]));
    const needle = query.trim().toLocaleLowerCase("th");
    const filtered = reports
      .map((report) => ({ report, game: gameById.get(report.gameId) }))
      .filter(({ report, game }) => game
        && (!tag || game.tags?.some((value) => value.toLocaleLowerCase("th") === tag.toLocaleLowerCase("th")))
        && (!needle || [game.game, game.id, report.message, report.source, report.createdBy]
          .some((value) => String(value ?? "").toLocaleLowerCase("th").includes(needle))));
    if (sort === "name") return filtered.sort((a, b) => String(a.game.game).localeCompare(String(b.game.game), "th"));
    return filtered;
  }, [query, reports, rowsWithState, sort, tag]);
  const displayRows = status === "review" ? reportRows : rows;
  const pageCount = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = displayRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function chooseStatus(nextStatus) {
    setStatus(nextStatus);
    setPage(0);
  }

  function chooseTag(nextTag) {
    setTag(nextTag);
    setPage(0);
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

  async function resolveReport(report) {
    setReportBusy(report.id);
    setActionError("");
    try {
      const response = await fetch(`/api/gameinfo/gamelist/${report.gameId}/reports`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: report.id, status: "resolved" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ยืนยันการแก้ไขไม่สำเร็จ");
      setReports((current) => current.filter((item) => item.id !== data.report.id));
    } catch (error) {
      setActionError(error.message);
    } finally {
      setReportBusy(null);
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
      <aside className="border-b border-linear-hairline bg-linear-surface-2 p-4 lg:border-b-0 lg:border-r">
        <nav aria-label="ตัวกรองเกม" className="lg:sticky lg:top-20">
          <button
            type="button"
            onClick={() => {
              chooseStatus("all");
              chooseTag("");
            }}
            className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${
              status === "all" && !tag
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
                    <span className="truncate">{item.name}</span>
                    <span className="text-xs opacity-70">{item.count}</span>
                  </button>
                ))}
              </div>
            ) : <p className="px-3 py-2 text-xs text-linear-ink-tertiary">ยังไม่มีหมวดหมู่</p>}
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
                href={`/gameinfo/${lang}?manage=1${dataMode === "idpass" ? "&mode=idpass" : ""}`}
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
        {actionError ? <p role="alert" className="mb-4 text-sm text-linear-primary">{actionError}</p> : null}
        {reportRefreshError ? <p role="status" className="mb-4 text-sm text-amber-700">{reportRefreshError}</p> : null}

        <section aria-label="สรุปสถานะเกม" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="เกมทั้งหมด" count={counts.all} icon={Gamepad2} active={status === "all"} onClick={() => chooseStatus("all")} />
          <StatCard label="พร้อมใช้งาน" count={counts.online} icon={CheckCircle2} active={status === "online"} onClick={() => chooseStatus("online")} tone="success" />
          <StatCard label="ต้องตรวจสอบ" count={counts.review} icon={AlertTriangle} active={status === "review"} onClick={() => chooseStatus("review")} tone="danger" />
          <StatCard label="ปิดใช้งาน" count={counts.offline} icon={CircleOff} active={status === "offline"} onClick={() => chooseStatus("offline")} />
        </section>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1 sm:max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-linear-ink-tertiary" />
            <span className="sr-only">ค้นหาเกม</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="ค้นหาชื่อเกม, ID, Server, VPN..."
              className="h-10 w-full rounded-lg border border-linear-hairline-strong bg-linear-surface-1 pl-9 pr-3 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
            />
          </label>
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

        {pageRows.length ? (
          status === "review" ? (
            <section aria-label="รายการที่ต้องตรวจสอบ">
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-[-0.2px] text-linear-ink">Report ที่ยังไม่แก้</h2>
                <p className="mt-1 text-xs text-linear-ink-tertiary">{reportRows.length} รายการ จาก {counts.review} เกม</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pageRows.map(({ report, game }) => (
                  <ReportCard key={report.id} report={report} game={game} editable={editable} lang={lang} dataMode={dataMode} busy={reportBusy === report.id} onResolve={resolveReport} />
                ))}
              </div>
            </section>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {pageRows.map((row) => (
                <GameCard key={row.id} row={row} editable={editable} lang={lang} dataMode={dataMode} favoriteBusy={favoriteBusy === row.id} onToggleFavorite={toggleFavorite} onReport={() => {
                  setActionError("");
                  setReportGame(row);
                  setReportMessage("");
                }} />
              ))}
            </div>
          )
        ) : (
          <div className="rounded-2xl border border-dashed border-linear-hairline-strong py-16 text-center text-sm text-linear-ink-tertiary">
            {status === "review" ? "ไม่มี Report ที่ต้องตรวจสอบ" : "ไม่พบเกมที่ตรงกับตัวกรอง"}
          </div>
        )}

        {pageCount > 1 ? (
          <div className="mt-6 flex items-center justify-end gap-2 text-sm text-linear-ink-subtle">
            <span className="mr-2">หน้า {currentPage + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0} aria-label="หน้าก่อน" className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong hover:bg-linear-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage === pageCount - 1} aria-label="หน้าถัดไป" className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong hover:bg-linear-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        ) : null}
      </main>
      {reportGame ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !reportSubmitting) setReportGame(null);
        }}>
          <form onSubmit={submitReport} role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" className="w-full max-w-md rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5" style={{ boxShadow: "var(--ll-shadow-modal)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="report-dialog-title" className="text-lg font-semibold tracking-[-0.2px] text-linear-ink">รายงานปัญหา</h2>
                <p className="mt-1 text-xs text-linear-ink-tertiary">{reportGame.game} · ID {reportGame.id}</p>
              </div>
              <button type="button" disabled={reportSubmitting} onClick={() => setReportGame(null)} aria-label="ปิด" className="flex h-10 w-10 items-center justify-center rounded-lg text-linear-ink-tertiary hover:bg-linear-surface-2 disabled:opacity-40"><X size={18} /></button>
            </div>
            <textarea autoFocus required maxLength={1000} rows={4} value={reportMessage} onChange={(event) => setReportMessage(event.target.value)} placeholder="แจ้งข้อมูลที่ผิดหรือปัญหาที่พบ..." className="mt-4 min-h-28 w-full resize-y rounded-lg border border-linear-hairline-strong bg-linear-canvas px-3 py-2 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20" />
            {actionError ? <p role="alert" className="mt-2 text-xs text-linear-primary">{actionError}</p> : null}
            <button type="submit" disabled={reportSubmitting || !reportMessage.trim()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-linear-ink px-4 text-sm font-medium text-linear-canvas disabled:opacity-40"><Send size={15} /> {reportSubmitting ? "กำลังส่ง..." : "ส่งรายงาน"}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, count, icon: Icon, active, onClick, tone }) {
  const iconClass = tone === "success"
    ? "bg-emerald-500/10 text-emerald-700"
    : tone === "danger"
      ? "bg-linear-primary/10 text-linear-primary"
    : tone === "warning"
      ? "bg-amber-500/10 text-amber-700"
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

function ReportCard({ report, game, editable, lang, dataMode, busy, onResolve }) {
  const params = new URLSearchParams();
  if (dataMode === "idpass") params.set("mode", "idpass");
  if (editable) params.set("manage", "1");
  const href = `/gameinfo/${lang}/${game.id}${params.size ? `?${params}` : ""}`;
  return (
    <article className="overflow-hidden rounded-2xl border border-linear-hairline bg-linear-surface-1" style={{ boxShadow: "var(--ll-shadow-card)" }}>
      <div className="flex gap-3 p-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-primary">
          {game.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.image} alt="" className="h-full w-full object-cover" />
          ) : <Gamepad2 size={26} className="text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-linear-primary/10 px-2 py-1 text-[11px] font-medium text-linear-primary">ยังไม่แก้</span>
            <span className="rounded-full bg-linear-surface-3 px-2 py-1 text-[11px] text-linear-ink-muted">{report.source === "topup" ? "Topup" : "Admin"}</span>
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold uppercase text-linear-ink">{game.game}</h3>
          <p className="mt-1 font-mono text-[11px] text-linear-ink-tertiary">Game ID: {game.id} · Report #{report.id}</p>
        </div>
      </div>
      <div className="border-t border-linear-hairline px-4 py-3">
        <p className="text-[11px] font-medium uppercase text-linear-ink-tertiary">เรื่องที่แจ้ง</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-linear-ink-subtle">{report.message}</p>
        <p className="mt-3 text-[11px] text-linear-ink-tertiary">
          {report.createdBy ? `โดย ${report.createdBy} · ` : ""}{new Date(report.createdAt).toLocaleString("th-TH")}
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-linear-hairline p-3">
        <Link href={href} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-linear-hairline-strong px-3 text-xs font-medium text-linear-ink hover:bg-linear-surface-2">
          {editable ? "เปิดจัดการเกม" : "เปิดดูเกม"}
        </Link>
        {editable ? (
          <button type="button" disabled={busy} onClick={() => onResolve(report)} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-linear-ink px-3 text-xs font-medium text-linear-canvas disabled:opacity-40">
            <CheckCircle2 size={15} /> ยืนยันแก้แล้ว
          </button>
        ) : null}
      </div>
    </article>
  );
}

function GameCard({ row, editable, lang, dataMode, favoriteBusy, onToggleFavorite, onReport }) {
  const status = STATUS_STYLE[row.serviceStatus] || STATUS_STYLE.online;
  const viewParams = new URLSearchParams();
  if (dataMode === "idpass") viewParams.set("mode", "idpass");
  const href = `/gameinfo/${lang}/${row.id}${viewParams.size ? `?${viewParams}` : ""}`;
  const packsHref = `/gameinfo/${lang}/${row.id}/packs${dataMode === "idpass" ? "?mode=idpass" : ""}`;
  if (editable) viewParams.set("manage", "1");
  const actionHref = `/gameinfo/${lang}/${row.id}${viewParams.size ? `?${viewParams}` : ""}`;
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
          <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onReport(); }} className="flex h-10 w-full items-center gap-2 px-3 text-left text-xs text-linear-ink-muted hover:bg-linear-surface-2">
            <Flag size={15} /> รายงานปัญหา
          </button>
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
            {row.reportCount > 0 ? <p className="mt-2 text-[11px] font-medium text-linear-primary">ต้องตรวจสอบ {row.reportCount}</p> : null}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-2 text-xs">
          <Meta label="Region" value={row.region} />
          <Meta label="Platform" value={row.platform} />
          <Meta label="Server" value={row.server} />
          <div className={`flex items-end rounded-lg px-2 py-2 text-[11px] font-medium ${isGameinfoBotAuto(row.botManual) ? "bg-emerald-500/10 text-emerald-700" : "bg-linear-surface-2 text-linear-ink-muted"}`}>
            <span className="truncate">{row.botManual || "Manual"}</span>
          </div>
        </dl>
      </Link>
      <div className="flex items-center gap-2 border-t border-linear-hairline p-3">
        <Link href={actionHref} className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-3 text-xs font-medium text-white ${editable ? "bg-linear-primary hover:bg-linear-primary-hover" : "bg-linear-ink"}`}>
          {editable ? "เปิดจัดการ" : "เปิดดู"}
        </Link>
        <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={false} hasData={row.hasTutorial} dataMode={dataMode} compact />
        <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={false} hasData={row.hasWarning} variant="warning" dataMode={dataMode} compact />
      </div>
    </article>
  );
}

function Meta({ label, value }) {
  return (
    <div className="rounded-lg bg-linear-surface-2 px-2 py-2">
      <dt className="text-[10px] uppercase text-linear-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate text-linear-ink-muted" title={value || "-"}>{value || "-"}</dd>
    </div>
  );
}
