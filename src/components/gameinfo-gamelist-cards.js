"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ChevronsLeft,
  ChevronsRight,
  CircleOff,
  Flag,
  Gamepad2,
  GitBranch,
  LayoutGrid,
  List,
  Menu,
  MoreVertical,
  PackagePlus,
  PackageSearch,
  Search,
  Send,
  Settings,
  Star,
  Flame,
  Globe,
  Link2,
  FileSpreadsheet,
  X,
} from "lucide-react";
import GameinfoDatasetToggle from "./gameinfo-dataset-toggle";
import GameinfoBotCatalog from "./gameinfo-bot-catalog";
import GameinfoPackPriceCompare from "./gameinfo-pack-price-compare";
import GameinfoPackUpdate from "./gameinfo-pack-update";
import { mockGameinfoPackUpdates } from "@/lib/gameinfo-pack-update";
import { apiJson } from "@/lib/api-json";
import GameinfoTutorialButton from "./gameinfo-tutorial-modal";
import {
  GAMEINFO_STATUSES,
  filterGameinfoRows,
  listGameinfoPublishers,
  listGameinfoTags,
  summarizeGameinfoRows,
  isGameinfoBotAuto,
} from "@/lib/gameinfo-dashboard";
import { gameinfoGameHref, gameinfoListHref, gameinfoPacksHref } from "@/lib/gameinfo-data-mode";
import { gameinfoRoleView, rememberGameinfoView } from "@/lib/gameinfo-view";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";
import { gameinfoGameColor, gameinfoGameInitials } from "@/lib/gameinfo-game-initials";
import GameinfoPriorityStars, { GameinfoWebBadge } from "./gameinfo-priority-stars";
import {
  requestGameinfoDiscard,
  useGameinfoUnsavedChanges,
} from "@/lib/gameinfo-unsaved-changes";

const PAGE_SIZE = 12;
// เทียบราคาแพ็ค and Russia Check are hidden from the rail for now; their pages still work by URL.
const SHOW_MARKET_TOOLS = false;

const EXTRA_FILTER_LABELS = {
  expiring: "ใกล้หมดอายุ",
  favorite: "รายการโปรด",
  "bot-auto": "Bot Auto",
  "priority-high": "สำคัญสูง ★★★",
  "web-on": "Web ON",
  "web-off": "Web OFF",
};

const STATUS_STYLE = {
  online: { label: "พร้อมใช้งาน", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  review: { label: "ต้องตรวจสอบ", dot: "bg-[#D90005]", text: "text-[#D90005]" },
  partial: { label: "เปิดบางส่วน", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  offline: { label: "ปิดใช้งาน", dot: "bg-linear-ink-tertiary", text: "text-linear-ink-subtle" },
};

export default function GameinfoGamelistCards({ initial, initialReports = [], tagImages = {}, publisherImages = {}, botChannels = [], botCategoryImages = {}, marketPage = null, botCatalogActive = false, priceComparisonActive = false, packUpdatePacks: initialPackUpdatePacks = null, userName = "", editable = false, topupView = false, canReport = false, lang, dataMode = "uid" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Pack Update and the game list switch in the browser (the URL follows by
  // pushState), not by loading the page again: the list is already here and
  // Pack Update only needs every game's packs, loaded once.
  const packUpdateActive = !botCatalogActive && !priceComparisonActive && searchParams.get("section") === "pack-update";
  // A page other than the game list fills the main area; the filters there lead back to the list.
  const otherSection = priceComparisonActive || packUpdateActive;
  // Every game is listed until the PG2 API says which changed (see gameinfo-pack-update.js).
  const packUpdateCount = initial.length;
  const listHref = gameinfoListHref(lang, dataMode, false);
  const packUpdateHref = `/gameinfo/${lang}?section=pack-update${dataMode === "uid" ? "" : `&mode=${dataMode}`}`;
  const [packUpdatePacks, setPackUpdatePacks] = useState(initialPackUpdatePacks);
  const [packUpdateError, setPackUpdateError] = useState("");
  const packUpdateLoading = useRef(false);
  const packUpdates = useMemo(() => (packUpdatePacks ? mockGameinfoPackUpdates(initial, packUpdatePacks) : null), [initial, packUpdatePacks]);
  const loadPackUpdatePacks = useCallback(() => {
    if (packUpdatePacks || packUpdateLoading.current) return;
    packUpdateLoading.current = true;
    setPackUpdateError("");
    apiJson(`/api/gameinfo/pack-update${dataMode === "idpass" ? "?mode=idpass" : ""}`, { fallbackError: "โหลดแพ็คของ Pack Update ไม่สำเร็จ" })
      .then((data) => setPackUpdatePacks(data.packsByGame || {}))
      .catch((error) => setPackUpdateError(error instanceof Error ? error.message : "โหลดแพ็คของ Pack Update ไม่สำเร็จ"))
      .finally(() => { packUpdateLoading.current = false; });
  }, [dataMode, packUpdatePacks]);
  useEffect(() => {
    if (packUpdateActive) loadPackUpdatePacks();
  }, [loadPackUpdatePacks, packUpdateActive]);
  // Back to the list from another section: Pack Update in place, the rest by loading the list.
  function leaveSection() {
    if (botCatalogActive || priceComparisonActive) router.push(listHref);
    else if (packUpdateActive) {
      window.history.pushState(null, "", listHref);
      window.scrollTo({ top: 0 });
    }
  }
  function openPackUpdate(event) {
    setSidebarOpen(false);
    if (botCatalogActive || priceComparisonActive || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (packUpdateActive) return;
    loadPackUpdatePacks();
    window.history.pushState(null, "", packUpdateHref);
    window.scrollTo({ top: 0 });
  }
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
  const [view, setView] = useState("grid");
  const reportDirty = Boolean(reportGame && reportMessage.trim());
  useGameinfoUnsavedChanges(reportDirty);

  function closeReport() {
    if (reportSubmitting) return;
    if (reportDirty) {
      requestGameinfoDiscard({
        message: "ข้อความ Report ที่ยังไม่ได้ส่งจะหายไป",
        confirmLabel: "ปิด Report",
        onConfirm: () => {
          setReportGame(null);
          setReportMessage("");
        },
      });
      return;
    }
    setReportGame(null);
    setReportMessage("");
  }
  const {
    dialogRef: reportDialogRef,
    titleId: reportDialogTitleId,
    onBackdropMouseDown: onReportBackdropMouseDown,
  } = useGameinfoDialog({
    open: Boolean(reportGame),
    onRequestClose: closeReport,
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
  // Stars set from the table apply to the filters and sort right away.
  const [priorityById, setPriorityById] = useState(() => new Map());
  const rowsWithState = useMemo(
    () => {
      const reportCounts = new Map();
      for (const report of reports) reportCounts.set(report.gameId, (reportCounts.get(report.gameId) || 0) + 1);
      return initial.map((row) => ({
        ...row,
        isFavorite: favoriteIds.has(row.id),
        reportCount: reportCounts.get(row.id) || 0,
        priority: priorityById.has(row.id) ? priorityById.get(row.id) : row.priority || 0,
      }));
    },
    [favoriteIds, initial, priorityById, reports]
  );
  const hasWebData = useMemo(() => initial.some((row) => row.web), [initial]);
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
    if (status !== "all") items.push({ id: "status", label: STATUS_STYLE[status]?.label || EXTRA_FILTER_LABELS[status] || status });
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
    if (botCatalogActive || otherSection) leaveSection();
    setStatus(nextStatus);
    setPage(0);
    setSidebarOpen(false);
  }

  function chooseTag(nextTag) {
    if (botCatalogActive || otherSection) leaveSection();
    setTag(nextTag);
    setPage(0);
    setSidebarOpen(false);
  }

  function choosePublisher(nextPublisher) {
    if (botCatalogActive || otherSection) leaveSection();
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

  const navItemClass = (active) =>
    `flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm font-semibold transition ${
      active ? "bg-[#D90005] text-white" : "text-linear-ink hover:bg-linear-surface-2"
    }`;
  const navCountClass = (active) => `ml-auto text-[13px] font-black ${active ? "text-[#FFE4E4]" : "text-linear-ink-subtle"}`;
  const sectionLabelClass = "px-3 pb-1 pt-3.5 text-[11px] font-extrabold tracking-[0.06em] text-linear-ink-subtle";

  return (
    <div className="mx-auto grid w-full max-w-[1400px] items-start lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6 lg:px-7 lg:py-7">
      <div className="flex h-14 items-center border-b border-linear-hairline bg-linear-surface-1 px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="เปิดเมนูตัวกรอง"
          aria-controls="gameinfo-filter-sidebar"
          aria-expanded={sidebarOpen}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-linear-hairline-strong bg-linear-surface-1 text-linear-ink transition hover:bg-linear-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D90005]/30"
        >
          <Menu size={20} />
        </button>
        <span className="ml-3 text-sm font-semibold text-linear-ink">เมนูตัวกรอง</span>
        {activeFilters.length ? (
          <span className="ml-2 rounded-full bg-[#D90005] px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`ใช้ตัวกรอง ${activeFilters.length} รายการ`}>
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
          over the navbar. On desktop the same aside becomes a sticky card. */}
      <aside
        id="gameinfo-filter-sidebar"
        className={`fixed bottom-0 left-0 top-16 z-30 w-[280px] overflow-y-auto border-r border-linear-hairline bg-linear-surface-1 p-3.5 transition-transform duration-200 ${
          sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        } lg:visible lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)] lg:w-auto lg:translate-x-0 lg:rounded-[14px] lg:border lg:shadow-[0_1px_3px_rgba(0,0,0,0.08)]`}
      >
        <div className="mb-1 flex items-center justify-between lg:hidden">
          <span className="px-2 text-sm font-extrabold text-linear-ink">ตัวกรองเกม</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="ปิดเมนูตัวกรอง"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D90005]/30"
          >
            <X size={20} />
          </button>
        </div>
        {/* Above the filters: the tag and publisher lists run long enough to bury anything under them. */}
        <nav aria-label="เครื่องมือ" className="mb-3 flex flex-col gap-1 border-b border-linear-hairline pb-3">
          <h2 className="mx-2 mb-2 mt-0.5 text-[13px] font-extrabold text-linear-ink-muted">เครื่องมือ</h2>
          <Link
            href={`/gameinfo/${lang}?section=game-bot-auto${dataMode === "uid" ? "" : `&mode=${dataMode}`}`}
            onClick={() => setSidebarOpen(false)}
            className={navItemClass(botCatalogActive)}
          >
            <GitBranch size={18} aria-hidden="true" className={botCatalogActive ? "" : "text-[#D90005]"} /> Game Bot Auto
          </Link>
          {SHOW_MARKET_TOOLS ? (
            <>
            <Link
              href={`/gameinfo/${lang}/pack-price-compare${dataMode === "uid" ? "" : `?mode=${dataMode}`}`}
              onClick={() => setSidebarOpen(false)}
              className={navItemClass(priceComparisonActive)}
            >
              <ArrowLeftRight size={18} aria-hidden="true" className={priceComparisonActive ? "" : "text-[#D90005]"} /> เทียบราคาแพ็ค
            </Link>
            <Link
              href={`/gameinfo/${lang}/russia-check`}
              onClick={() => setSidebarOpen(false)}
              className={navItemClass(false)}
            >
              <PackageSearch size={18} aria-hidden="true" className="text-[#D90005]" /> Russia Check
            </Link>
            </>
          ) : null}
          {editable ? (
            <>
              <Link href={`/gameinfo/${lang}/topup-web`} className={navItemClass(false)}>
                <Link2 size={18} aria-hidden="true" className="text-[#D90005]" /> เชื่อมเกมกับเว็บ TopUp
              </Link>
              <Link href={`/gameinfo/${lang}/sheet-import`} className={navItemClass(false)}>
                <FileSpreadsheet size={18} aria-hidden="true" className="text-[#D90005]" /> นำเข้าจาก Google Sheet
              </Link>
              <span aria-hidden="true" className="mx-1 mb-1 mt-2.5 h-px bg-linear-hairline" />
              <Link href={gameinfoListHref(lang, dataMode, true)} className={`${navItemClass(false)} text-linear-ink-muted`}>
                <Settings size={18} aria-hidden="true" /> ตั้งค่าระบบ
              </Link>
            </>
          ) : null}
        </nav>
        <nav aria-label="ตัวกรองเกม" className="flex flex-col gap-1">
          <h2 className="mx-2 mb-2 mt-0.5 hidden text-[13px] font-extrabold text-linear-ink-muted lg:block">ตัวกรองเกม</h2>
          <button
            type="button"
            onClick={() => {
              clearFilters();
              setSidebarOpen(false);
              if (botCatalogActive || otherSection) leaveSection();
            }}
            className={`${navItemClass(!botCatalogActive && status === "all" && !tag && !publisher && !otherSection)} min-h-11 font-bold`}
          >
            <Gamepad2 size={18} aria-hidden="true" />
            <span>เกมทั้งหมด</span>
            <span className={navCountClass(!botCatalogActive && status === "all" && !tag && !publisher && !otherSection)}>{counts.all}</span>
          </button>
          <Link
            href={packUpdateHref}
            onClick={openPackUpdate}
            onMouseEnter={loadPackUpdatePacks}
            onFocus={loadPackUpdatePacks}
            className={`${navItemClass(packUpdateActive)} min-h-11 font-bold`}
          >
            <PackagePlus size={18} aria-hidden="true" />
            <span>Pack Update</span>
            {packUpdateCount ? <span className={`ml-auto rounded-full px-2 text-[11px] ${packUpdateActive ? "bg-white text-[#D90005]" : "bg-[#D90005] text-white"}`}>{packUpdateCount}</span> : null}
          </Link>

          <details open className="group/sec">
            <summary className={`${sectionLabelClass} cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden`}>
              สถานะบริการ
            </summary>
            <div className="flex flex-col gap-1">
              {GAMEINFO_STATUSES.slice(1).map((item) => {
                const active = !botCatalogActive && status === item.id && !otherSection;
                return (
                  <button key={item.id} type="button" onClick={() => chooseStatus(item.id)} className={navItemClass(active)}>
                    <span aria-hidden="true" className={`mx-[5px] h-2 w-2 rounded-full ${active ? "bg-white" : STATUS_STYLE[item.id].dot}`} />
                    <span>{item.label}</span>
                    <span className={navCountClass(active)}>{counts[item.id]}</span>
                  </button>
                );
              })}
            </div>
          </details>

          <details open>
            <summary className={`${sectionLabelClass} cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden`}>
              หมวดหมู่
            </summary>
            {tagOptions.length ? (
              <div className="flex flex-col gap-1">
                {tagOptions.map((item) => {
                  const active = !botCatalogActive && tag === item.name && !otherSection;
                  return (
                    <button key={item.name} type="button" onClick={() => chooseTag(tag === item.name ? "" : item.name)} className={navItemClass(active)}>
                      {tagImages[item.name] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tagImages[item.name]} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                      ) : null}
                      <span className="truncate">{item.name}</span>
                      <span className={navCountClass(active)}>{item.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : <p className="mx-3 my-0 rounded-[10px] border border-dashed border-linear-hairline px-3 py-2.5 text-[13px] text-linear-ink-subtle">ยังไม่มีหมวดหมู่</p>}
          </details>

          <details open>
            <summary className={`${sectionLabelClass} cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden`}>
              ค่ายเกม
            </summary>
            {publisherOptions.length ? (
              <div className="flex flex-col gap-1">
                {publisherOptions.map((item) => {
                  const active = !botCatalogActive && publisher === item.name && !otherSection;
                  return (
                    <button key={item.name} type="button" onClick={() => choosePublisher(publisher === item.name ? "" : item.name)} className={navItemClass(active)}>
                      {publisherImages[item.name] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={publisherImages[item.name]} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                      ) : null}
                      <span className="truncate">{item.name}</span>
                      <span className={navCountClass(active)}>{item.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : <p className="mx-3 my-0 rounded-[10px] border border-dashed border-linear-hairline px-3 py-2.5 text-[13px] text-linear-ink-subtle">ยังไม่มีค่ายเกม</p>}
          </details>

          <span aria-hidden="true" className="mx-1 mb-1 mt-3.5 h-px bg-linear-hairline" />
          <button type="button" onClick={() => chooseStatus("expiring")} className={navItemClass(!botCatalogActive && status === "expiring" && !otherSection)}>
            <Clock size={18} aria-hidden="true" />
            <span>ใกล้หมดอายุ</span>
            <span className={navCountClass(!botCatalogActive && status === "expiring" && !otherSection)}>{counts.expiring}</span>
          </button>
          <button type="button" onClick={() => chooseStatus("favorite")} className={navItemClass(!botCatalogActive && status === "favorite" && !otherSection)}>
            <Star size={18} aria-hidden="true" />
            <span>รายการโปรด</span>
            <span className={navCountClass(!botCatalogActive && status === "favorite" && !otherSection)}>{counts.favorite}</span>
          </button>
          <button type="button" onClick={() => chooseStatus("bot-auto")} className={navItemClass(!botCatalogActive && status === "bot-auto" && !otherSection)}>
            <Bot size={18} aria-hidden="true" />
            <span>Bot Auto</span>
            <span className={navCountClass(!botCatalogActive && status === "bot-auto" && !otherSection)}>{counts.botAuto}</span>
          </button>
          <button type="button" onClick={() => chooseStatus("priority-high")} className={navItemClass(!botCatalogActive && status === "priority-high" && !otherSection)}>
            <Flame size={18} aria-hidden="true" />
            <span>สำคัญสูง ★★★</span>
            <span className={navCountClass(!botCatalogActive && status === "priority-high" && !otherSection)}>{counts.priorityHigh}</span>
          </button>
          {hasWebData ? (
            <>
              <button type="button" onClick={() => chooseStatus("web-on")} className={navItemClass(!botCatalogActive && status === "web-on" && !otherSection)}>
                <Globe size={18} aria-hidden="true" />
                <span>Web ON</span>
                <span className={navCountClass(!botCatalogActive && status === "web-on" && !otherSection)}>{counts.webOn}</span>
              </button>
              <button type="button" onClick={() => chooseStatus("web-off")} className={navItemClass(!botCatalogActive && status === "web-off" && !otherSection)}>
                <Globe size={18} aria-hidden="true" className="opacity-50" />
                <span>Web OFF</span>
                <span className={navCountClass(!botCatalogActive && status === "web-off" && !otherSection)}>{counts.webOff}</span>
              </button>
            </>
          ) : null}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-6 lg:p-0">
        {botCatalogActive ? (
          <GameinfoBotCatalog channels={botChannels} categoryImages={botCategoryImages} editable={editable} lang={lang} />
        ) : priceComparisonActive ? (
          <GameinfoPackPriceCompare page={marketPage} editable={editable} />
        ) : packUpdateActive ? (
          packUpdates ? (
            <GameinfoPackUpdate initialGames={packUpdates} userName={userName} initialTab={searchParams.get("tab") === "history" ? "history" : "list"} />
          ) : (
            <div role="status" className="rounded-2xl border border-linear-hairline bg-linear-surface-1 p-8 text-center text-sm text-linear-ink-muted">
              {packUpdateError ? (
                <span className="flex flex-col items-center gap-3">
                  <span className="text-linear-danger">{packUpdateError}</span>
                  <button type="button" onClick={loadPackUpdatePacks} className="h-10 rounded-full border border-linear-hairline-strong px-4 font-bold text-linear-ink hover:bg-linear-surface-2">ลองอีกครั้ง</button>
                </span>
              ) : "กำลังโหลดแพ็คของทุกเกม…"}
            </div>
          )
        ) : (
          <>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-xs font-black tracking-[0.14em] text-[#D90005]">GAME DATABASE</p>
            <h1 className="m-0 text-[clamp(28px,3vw,36px)] font-black leading-tight text-linear-ink">คลังข้อมูลเกม</h1>
          </div>
          <GameinfoDatasetToggle basePath={`/gameinfo/${lang}`} />
        </div>
        {actionError ? <p role="alert" className="m-0 text-sm text-linear-danger">{actionError}</p> : null}
        {reportRefreshError ? <p role="status" className="m-0 text-sm text-linear-warning">{reportRefreshError}</p> : null}

        <section aria-label="สรุปสถานะเกม" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="เกมทั้งหมด" count={counts.all} icon={Gamepad2} active={status === "all"} onClick={() => chooseStatus("all")} />
          <StatCard label="พร้อมใช้งาน" count={counts.online} icon={CheckCircle2} active={status === "online"} onClick={() => chooseStatus("online")} tone="success" />
          <StatCard label="ต้องตรวจสอบ" count={counts.review} icon={AlertTriangle} active={status === "review"} onClick={() => chooseStatus("review")} tone="danger" />
          <StatCard label="ปิดใช้งาน" count={counts.offline} icon={CircleOff} active={status === "offline"} onClick={() => chooseStatus("offline")} tone="muted" />
        </section>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search size={18} strokeWidth={2.2} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D90005]" />
            <label htmlFor="gameinfo-game-search" className="sr-only">ค้นหาเกม</label>
            <input
              id="gameinfo-game-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="ค้นหาชื่อเกม, ID, Server, VPN..."
              className="h-[46px] w-full rounded-xl border border-linear-hairline bg-linear-surface-1 pl-10 pr-11 text-[15px] text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-[#D90005] focus:ring-2 focus:ring-[#D90005]/20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => clearFilter("query")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
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
            className="h-[46px] cursor-pointer rounded-xl border border-linear-hairline bg-linear-surface-1 px-3.5 text-sm font-semibold text-linear-ink outline-none focus:border-[#D90005]"
          >
            <option value="order">ตามลำดับ</option>
            <option value="latest">ID ล่าสุด</option>
            <option value="name">ชื่อ A–Z</option>
            <option value="priority">ความสำคัญ (สูง → ต่ำ)</option>
          </select>
          <div role="group" aria-label="รูปแบบการแสดงผล" className="flex h-[46px] gap-[3px] rounded-xl border border-linear-hairline bg-linear-surface-1 p-[3px]">
            {[
              { id: "grid", label: "แสดงเป็นการ์ด", icon: LayoutGrid },
              { id: "list", label: "แสดงเป็นตาราง", icon: List },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setView(option.id)}
                  aria-label={option.label}
                  title={option.label}
                  aria-pressed={view === option.id}
                  className={`flex w-10 items-center justify-center rounded-[9px] transition ${
                    view === option.id ? "bg-linear-ink text-linear-canvas" : "text-linear-ink-muted hover:bg-linear-surface-2"
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-[30px] flex-wrap items-center gap-2.5" aria-live="polite">
          <span className="text-sm text-linear-ink-muted">พบ {rows.length} จาก {rowsWithState.length} เกม</span>
          {activeFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => clearFilter(filter.id)}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-[#D90005]/30 bg-[#D90005]/[0.06] pl-3 pr-2 text-[13px] font-bold text-[#D90005] hover:bg-[#D90005]/10"
              aria-label={`ยกเลิกตัวกรอง ${filter.label}`}
            >
              {filter.label}<X size={14} strokeWidth={2.4} />
            </button>
          ))}
          {activeFilters.length > 1 ? (
            <button type="button" onClick={clearFilters} className="h-[30px] px-1 text-[13px] font-bold text-[#D90005] hover:underline">
              ล้างทั้งหมด
            </button>
          ) : null}
        </div>

        {pageRows.length ? (
          view === "list" ? (
            <div className="overflow-x-auto rounded-[14px] border border-linear-hairline bg-linear-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead>
                  <tr className="bg-linear-surface-3 text-left">
                    {["ความสำคัญ", "เกม", "สถานะ", "โหมด", "WEB", "REGION", "PLATFORM", "SERVER"].map((heading) => (
                      <th key={heading} scope="col" className="px-4 py-3 text-[11px] font-black tracking-[0.08em] text-linear-ink-muted">{heading}</th>
                    ))}
                    {/* Pinned to the right edge, so the buttons stay in view while a narrow screen scrolls the table. */}
                    <th scope="col" className="sticky right-0 bg-linear-surface-3 px-4 py-3 text-right text-[11px] font-black tracking-[0.08em] text-linear-ink-muted shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.25)]">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <GameRow
                      key={row.id}
                      row={row}
                      editable={editable}
                      topupView={topupView}
                      lang={lang}
                      dataMode={dataMode}
                      onPriorityChange={(value) => setPriorityById((current) => new Map(current).set(row.id, value))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
              {pageRows.map((row) => (
                <GameCard key={row.id} row={row} editable={editable} topupView={topupView} canReport={canReport} lang={lang} dataMode={dataMode} favoriteBusy={favoriteBusy === row.id} onToggleFavorite={toggleFavorite} onReport={() => {
                  setActionError("");
                  setReportGame(row);
                  setReportMessage("");
                }} />
              ))}
            </div>
          )
        ) : (
          <div className="rounded-[14px] border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-6 py-12 text-center">
            <p className="m-0 text-[17px] font-black text-linear-ink">{status === "review" ? "ไม่มี Report ที่ต้องตรวจสอบ" : "ไม่พบเกมที่ตรงกับตัวกรอง"}</p>
            {activeFilters.length ? (
              <>
                <p className="m-0 mt-1 text-sm text-linear-ink-muted">ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง</p>
                <button type="button" onClick={clearFilters} className="mt-4 h-10 rounded-[10px] border border-linear-hairline-strong bg-linear-surface-1 px-4 text-sm font-bold text-linear-ink hover:bg-linear-surface-2">
                  ล้างตัวกรองทั้งหมด
                </button>
              </>
            ) : null}
          </div>
        )}

        {pageCount > 1 ? (
          <nav aria-label="แบ่งหน้า" className="mt-2 flex items-center justify-center gap-1.5">
            <button type="button" onClick={() => setPage(0)} disabled={currentPage === 0} title="หน้าแรก" aria-label="หน้าแรก" className={PAGE_BUTTON}><ChevronsLeft size={16} strokeWidth={2.2} /></button>
            <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0} title="หน้าก่อน" aria-label="หน้าก่อน" className={PAGE_BUTTON}><ChevronLeft size={16} strokeWidth={2.2} /></button>
            <span className="whitespace-nowrap px-3.5 text-sm text-linear-ink-muted">
              หน้า <strong className="font-black text-[#D90005]">{currentPage + 1}</strong> / {pageCount}
            </span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage === pageCount - 1} title="หน้าถัดไป" aria-label="หน้าถัดไป" className={PAGE_BUTTON}><ChevronRight size={16} strokeWidth={2.2} /></button>
            <button type="button" onClick={() => setPage(pageCount - 1)} disabled={currentPage === pageCount - 1} title="หน้าสุดท้าย" aria-label="หน้าสุดท้าย" className={PAGE_BUTTON}><ChevronsRight size={16} strokeWidth={2.2} /></button>
          </nav>
        ) : null}
          </>
        )}
      </main>
      {reportGame ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={onReportBackdropMouseDown}>
          <form ref={reportDialogRef} tabIndex={-1} onSubmit={submitReport} role="dialog" aria-modal="true" aria-labelledby={reportDialogTitleId} className="w-full max-w-md rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5" style={{ boxShadow: "var(--ll-shadow-modal)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={reportDialogTitleId} className="text-lg font-black text-linear-ink">รายงานปัญหา</h2>
                <p className="mt-1 text-xs text-linear-ink-tertiary">{reportGame.game} · ID {reportGame.id}</p>
              </div>
              <button type="button" disabled={reportSubmitting} onClick={closeReport} aria-label="ปิด" className="flex h-10 w-10 items-center justify-center rounded-lg text-linear-ink-tertiary hover:bg-linear-surface-2 disabled:opacity-40"><X size={18} /></button>
            </div>
            <textarea autoFocus required maxLength={1000} rows={4} value={reportMessage} onChange={(event) => setReportMessage(event.target.value)} placeholder="แจ้งข้อมูลที่ผิดหรือปัญหาที่พบ..." className="mt-4 min-h-28 w-full resize-y rounded-lg border border-linear-hairline-strong bg-linear-canvas px-3 py-2 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-[#D90005] focus:ring-2 focus:ring-[#D90005]/20" />
            {actionError ? <p role="alert" className="mt-2 text-xs text-linear-danger">{actionError}</p> : null}
            <button type="submit" disabled={reportSubmitting || !reportMessage.trim()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#D90005] px-4 text-sm font-bold text-white hover:bg-[#B80004] disabled:opacity-40"><Send size={15} /> {reportSubmitting ? "กำลังส่ง..." : "ส่งรายงาน"}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

const PAGE_BUTTON =
  "flex h-[42px] w-[42px] items-center justify-center rounded-full border border-linear-hairline bg-linear-surface-1 text-linear-ink transition hover:bg-linear-surface-2 disabled:cursor-not-allowed disabled:text-linear-ink-tertiary disabled:hover:bg-linear-surface-1";

const STAT_TONES = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  danger: "bg-[#D90005]/10 text-[#D90005]",
  muted: "bg-linear-surface-3 text-linear-ink-subtle",
};

function StatCard({ label, count, icon: Icon, active, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3.5 rounded-[14px] border-[1.5px] p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition ${
        active ? "border-[#D90005] bg-[#D90005]/[0.04]" : "border-linear-hairline bg-linear-surface-1 hover:bg-linear-surface-2"
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${STAT_TONES[tone] || "bg-linear-surface-3 text-linear-ink"}`}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] text-linear-ink-muted">{label}</span>
        <strong className={`text-[28px] font-black ${tone === "danger" && count > 0 ? "text-[#D90005]" : "text-linear-ink"}`}>{count}</strong>
      </span>
    </button>
  );
}

function GameThumb({ row, size }) {
  const dim = row.serviceStatus === "offline" ? "opacity-55" : "";
  if (row.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={row.image} alt="" className={`shrink-0 rounded-xl object-cover ${dim}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl font-black tracking-[0.02em] text-white ${dim}`}
      style={{ width: size, height: size, fontSize: size > 50 ? 22 : 13, background: gameinfoGameColor(row.id) }}
    >
      {gameinfoGameInitials(row.game)}
    </span>
  );
}

function StatusLabel({ status }) {
  return (
    <span className={`flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold ${status.text}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.dot}`} />
      {status.label}
    </span>
  );
}

function ModeBadge({ value }) {
  return (
    <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ${isGameinfoBotAuto(value) ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400" : "bg-linear-surface-3 text-linear-ink-muted"}`}>
      {value || "Manual"}
    </span>
  );
}

// Opening a game from the list starts it in the view for the reader's role —
// Product for admins, Topup for everyone else; the switch on the game page
// still changes it from there. Set as the cookie on the way out, so the URL
// stays free of a ?view= that back/forward would bring back.
// Not prefetched: a prefetch would render the page with whatever view the
// cookie held before the click.
function DetailLink({ editable, onClick, ...props }) {
  return <Link {...props} prefetch={false} onClick={(event) => { rememberGameinfoView(gameinfoRoleView(editable)); onClick?.(event); }} />;
}

function GameCard({ row, editable, topupView, canReport, lang, dataMode, favoriteBusy, onToggleFavorite, onReport }) {
  const status = STATUS_STYLE[row.serviceStatus] || STATUS_STYLE.online;
  const href = gameinfoGameHref(lang, row.id, dataMode, false);
  const packsHref = gameinfoPacksHref(lang, row.id, dataMode);
  const actionHref = editable ? gameinfoGameHref(lang, row.id, dataMode, true) : href;
  return (
    <article className="flex flex-col overflow-hidden rounded-[14px] border border-linear-hairline bg-linear-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:border-[#D90005]/35 hover:shadow-[0_14px_28px_-16px_rgba(143,0,25,0.4)]">
      {row.reportCount > 0 ? (
        <div className="flex items-center gap-2 bg-[#D90005] px-4 py-2 text-[13px] font-bold text-white">
          <AlertTriangle size={15} strokeWidth={2.4} aria-hidden="true" /> ต้องตรวจสอบ {row.reportCount} รายการ
        </div>
      ) : null}
      {row.packExpiringCount > 0 ? (
        <div className="flex items-center gap-2 bg-amber-500/15 px-4 py-2 text-[13px] font-bold text-amber-800 dark:text-amber-300">
          <Clock size={15} strokeWidth={2.4} aria-hidden="true" /> แพ็คใกล้หมดอายุ {row.packExpiringCount} แพ็ค
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div className="flex items-start gap-3.5">
          <DetailLink href={href} editable={editable} tabIndex={-1} aria-hidden="true" className="shrink-0">
            <GameThumb row={row} size={76} />
          </DetailLink>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="m-0 text-[15px] font-black uppercase leading-snug">
              <DetailLink href={href} editable={editable} className="line-clamp-2 text-linear-ink hover:text-[#D90005]">{row.game}</DetailLink>
            </h2>
            <span className="flex items-center gap-2 font-mono text-xs text-linear-ink-subtle">
              ID: {row.id}
              {row.priority ? <GameinfoPriorityStars value={row.priority} size={13} /> : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <StatusLabel status={status} />
              <ModeBadge value={row.botManual} />
              {row.web ? <GameinfoWebBadge web={row.web} size="sm" /> : null}
            </div>
          </div>
          <details className="relative -mr-1.5 -mt-1.5 shrink-0">
            <summary aria-label={`ตัวเลือกเพิ่มเติมของ ${row.game}`} title="เมนูเกม" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-[10px] text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink [&::-webkit-details-marker]:hidden">
              <MoreVertical size={18} strokeWidth={2.4} />
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 py-1" style={{ boxShadow: "var(--ll-shadow-modal)" }}>
              <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onToggleFavorite(row); }} disabled={favoriteBusy} aria-pressed={row.isFavorite} className="flex h-10 w-full items-center gap-2 px-3 text-left text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40">
                <Star size={15} className={row.isFavorite ? "fill-current text-[#D90005]" : ""} />
                {row.isFavorite ? "เอาออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
              </button>
              {canReport ? <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onReport(); }} className="flex h-10 w-full items-center gap-2 px-3 text-left text-xs text-linear-ink-muted hover:bg-linear-surface-2">
                <Flag size={15} /> รายงานปัญหา
              </button> : null}
              {editable ? <Link href={packsHref} className="flex h-10 items-center gap-2 px-3 text-xs text-linear-ink-muted hover:bg-linear-surface-2"><Settings size={15} /> แก้ไข Pack</Link> : null}
            </div>
          </details>
        </div>
        <dl className="m-0 grid grid-cols-3 rounded-[10px] bg-linear-surface-3 px-1 py-2.5">
          <Meta label="Region" value={row.region} />
          <Meta label="Platform" value={row.platform} />
          <Meta label="Server" value={row.server} />
        </dl>
      </div>
      <div className="flex items-center gap-2 px-4 pb-4">
        {editable ? (
          <Link href={actionHref} className="inline-flex h-[42px] min-w-0 flex-1 items-center justify-center rounded-[10px] bg-linear-primary px-3 text-sm font-extrabold text-white hover:bg-linear-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D90005]">
            เปิดจัดการ
          </Link>
        ) : null}
        <DetailLink
          href={href}
          editable={editable}
          className={editable
            ? "flex h-[42px] min-w-20 shrink-0 items-center justify-center rounded-[10px] border border-linear-hairline-strong px-3 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D90005]"
            : "inline-flex h-[42px] min-w-0 flex-1 items-center justify-center rounded-[10px] bg-linear-primary px-3 text-sm font-extrabold text-white hover:bg-linear-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D90005]"}
        >
          ข้อมูลเกม
        </DetailLink>
        <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={false} hasData={row.hasWarning} variant="warning" dataMode={dataMode} compact />
      </div>
    </article>
  );
}

function GameRow({ row, editable, topupView, lang, dataMode, onPriorityChange }) {
  const status = STATUS_STYLE[row.serviceStatus] || STATUS_STYLE.online;
  const href = gameinfoGameHref(lang, row.id, dataMode, false);
  const actionHref = editable ? gameinfoGameHref(lang, row.id, dataMode, true) : href;
  return (
    <tr className="border-t border-linear-hairline transition hover:bg-[#D90005]/[0.03]">
      <td className="px-3 py-2.5">
        {/* key: a reset from elsewhere (none today) would show the new value. */}
        <GameinfoPriorityStars key={row.priority} gameId={row.id} value={row.priority || 0} editable={editable} size={16} onSaved={onPriorityChange} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <GameThumb row={row} size={40} />
          <div className="flex min-w-0 flex-col">
            <DetailLink href={href} editable={editable} className="font-black uppercase text-linear-ink hover:text-[#D90005]">{row.game}</DetailLink>
            <span className="font-mono text-xs text-linear-ink-subtle">ID: {row.id}</span>
          </div>
          {row.packExpiringCount > 0 ? (
            <span className="whitespace-nowrap rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">ใกล้หมดอายุ {row.packExpiringCount}</span>
          ) : null}
          {row.reportCount > 0 ? (
            <span className="whitespace-nowrap rounded-md bg-[#D90005] px-2 py-0.5 text-xs font-bold text-white">ต้องตรวจสอบ {row.reportCount} รายการ</span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-2.5"><StatusLabel status={status} /></td>
      <td className="px-4 py-2.5"><ModeBadge value={row.botManual} /></td>
      <td className="px-4 py-2.5"><GameinfoWebBadge web={row.web} size="sm" /></td>
      <td className="px-4 py-2.5 font-bold text-linear-ink">{row.region || "-"}</td>
      <td className="px-4 py-2.5 font-bold text-linear-ink">{row.platform || "-"}</td>
      <td className="px-4 py-2.5 font-bold text-linear-ink">{row.server || "-"}</td>
      <td className="sticky right-0 bg-linear-surface-1 px-4 py-2.5 shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.25)]">
        <div className="flex justify-end gap-1.5">
          {editable ? (
            <Link href={actionHref} className="flex h-9 items-center whitespace-nowrap rounded-[9px] bg-[#D90005] px-3.5 text-[13px] font-extrabold text-white hover:bg-[#B80004]">
              เปิดจัดการ
            </Link>
          ) : null}
          <DetailLink
            href={href}
            editable={editable}
            className={editable
              ? "flex h-9 items-center whitespace-nowrap rounded-[9px] border border-linear-hairline-strong px-3 text-[13px] font-medium text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink"
              : "flex h-9 items-center whitespace-nowrap rounded-[9px] bg-[#D90005] px-3.5 text-[13px] font-extrabold text-white hover:bg-[#B80004]"}
          >
            ข้อมูลเกม
          </DetailLink>
        </div>
      </td>
    </tr>
  );
}

function Meta({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2.5 [&+&]:border-l [&+&]:border-linear-hairline">
      <dt className="text-[10px] font-black uppercase tracking-[0.1em] text-linear-ink-subtle">{label}</dt>
      <dd className="m-0 truncate text-sm font-bold text-linear-ink" title={value || "-"}>{value || "-"}</dd>
    </div>
  );
}
