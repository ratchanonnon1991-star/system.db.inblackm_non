"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Gamepad2,
  Search,
} from "lucide-react";
import GameinfoDatasetToggle from "./gameinfo-dataset-toggle";
import GameinfoTutorialButton from "./gameinfo-tutorial-modal";
import {
  GAMEINFO_STATUSES,
  filterGameinfoRows,
  listGameinfoTags,
  summarizeGameinfoRows,
} from "@/lib/gameinfo-dashboard";

const PAGE_SIZE = 12;

const STATUS_STYLE = {
  online: { label: "พร้อมใช้งาน", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700" },
  review: { label: "ต้องตรวจสอบ", dot: "bg-linear-primary", badge: "bg-linear-primary/10 text-linear-primary" },
  partial: { label: "เปิดบางส่วน", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700" },
  new: { label: "เกมใหม่", dot: "bg-linear-primary", badge: "bg-linear-primary/10 text-linear-primary" },
  offline: { label: "ปิดใช้งาน", dot: "bg-linear-ink-tertiary", badge: "bg-linear-surface-3 text-linear-ink-subtle" },
};

export default function GameinfoGamelistCards({ initial, editable = false, lang, dataMode = "uid" }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("order");
  const [page, setPage] = useState(0);
  const counts = useMemo(() => summarizeGameinfoRows(initial), [initial]);
  const tagOptions = useMemo(() => listGameinfoTags(initial), [initial]);
  const rows = useMemo(
    () => filterGameinfoRows(initial, { query, status, tag, sort }),
    [initial, query, sort, status, tag]
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function chooseStatus(nextStatus) {
    setStatus(nextStatus);
    setPage(0);
  }

  function chooseTag(nextTag) {
    setTag(nextTag);
    setPage(0);
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pageRows.map((row) => (
              <GameCard key={row.id} row={row} editable={editable} lang={lang} dataMode={dataMode} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-linear-hairline-strong py-16 text-center text-sm text-linear-ink-tertiary">
            ไม่พบเกมที่ตรงกับตัวกรอง
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

function GameCard({ row, editable, lang, dataMode }) {
  const status = STATUS_STYLE[row.serviceStatus] || STATUS_STYLE.online;
  const viewParams = new URLSearchParams();
  if (dataMode === "idpass") viewParams.set("mode", "idpass");
  const href = `/gameinfo/${lang}/${row.id}${viewParams.size ? `?${viewParams}` : ""}`;
  if (editable) viewParams.set("manage", "1");
  const actionHref = `/gameinfo/${lang}/${row.id}${viewParams.size ? `?${viewParams}` : ""}`;
  return (
    <article className="overflow-hidden rounded-2xl border border-linear-hairline bg-linear-surface-1" style={{ boxShadow: "var(--ll-shadow-card)" }}>
      <Link href={href} className="block p-4 hover:bg-linear-surface-2">
        <div className="flex gap-3">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-surface-3">
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.image} alt="" className="h-full w-full object-cover" />
            ) : <Gamepad2 size={28} className="text-linear-ink-tertiary" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${status.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}
            </span>
            <h2 className="mt-2 line-clamp-2 text-base font-semibold uppercase tracking-[-0.2px] text-linear-ink">{row.game}</h2>
            <p className="mt-1 font-mono text-xs text-linear-ink-tertiary">ID: {row.id}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Meta label="Region" value={row.region} />
          <Meta label="Platform" value={row.platform} />
          <Meta label="Server" value={row.server} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-linear-ink-subtle">
          <span className="rounded-full bg-linear-surface-3 px-2 py-1">VPN {row.vpnComputed || "NO"}</span>
          <span className="rounded-full bg-linear-surface-3 px-2 py-1">{row.botManual || "ไม่ระบุระบบ"}</span>
          <span className="rounded-full bg-linear-surface-3 px-2 py-1">{row.packCount || 0} แพ็ก</span>
          {row.reportCount > 0 ? <span className="rounded-full bg-linear-primary/10 px-2 py-1 font-medium text-linear-primary">ต้องตรวจสอบ {row.reportCount}</span> : null}
        </div>
        {(row.tags || []).length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-linear-surface-3 px-2 py-1 text-[11px] text-linear-ink-muted">{tag}</span>)}
            {row.tags.length > 3 ? <span className="px-1 py-1 text-[11px] text-linear-ink-tertiary">+{row.tags.length - 3}</span> : null}
          </div>
        ) : null}
      </Link>
      <div className="flex items-center gap-2 border-t border-linear-hairline p-3">
        <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={false} hasData={row.hasTutorial} dataMode={dataMode} />
        <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={false} hasData={row.hasWarning} variant="warning" dataMode={dataMode} />
        <Link href={actionHref} className="ml-auto inline-flex h-10 items-center rounded-lg bg-linear-ink px-3 text-xs font-medium text-linear-canvas">
          {editable ? "เปิดจัดการ" : "เปิดดู"}
        </Link>
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
