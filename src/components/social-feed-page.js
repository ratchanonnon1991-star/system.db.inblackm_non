"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, CircleDot, Clock3, Download, ExternalLink,
  Filter, Folder, FolderPlus, LayoutGrid, MessageCircle, Monitor, Pencil, Play, Plus, Radio, RefreshCw, Search, Square, Trash2, X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { parseSocialFeedSearchTerms } from "@/lib/social-feed-search";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPTY = { categories: [], sources: [], rules: [], folders: [], posts: [], accounts: [], collectorSummary: { activeCollectorCount: 0, enabledSourceCount: 0, sourcesPerCollector: 0, riskLevel: "offline", running: false }, pagination: { page: 1, pageSize: "20", total: 0, totalPages: 1 } };

function formatTime(value) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatPostTime(value, now) {
  if (!value) return "ไม่ทราบเวลาโพสต์";
  const timestamp = new Date(value).getTime();
  const elapsed = Number(now) - timestamp;
  if (!Number.isFinite(timestamp) || elapsed < 0 || elapsed >= 24 * 60 * 60 * 1000) return `เวลาโพสต์ ${formatTime(value)}`;
  if (elapsed < 60 * 1000) return "โพสต์เมื่อสักครู่";
  if (elapsed < 60 * 60 * 1000) return `โพสต์เมื่อ ${Math.floor(elapsed / 60000)} นาทีที่แล้ว`;
  return `โพสต์เมื่อ ${Math.floor(elapsed / 3600000)} ชั่วโมงที่แล้ว`;
}

function HighlightedText({ text, query }) {
  const terms = parseSocialFeedSearchTerms(query);
  if (!terms.length) return text;
  const normalizedTerms = new Set(terms.map((term) => term.toLocaleLowerCase()));
  const escaped = terms.sort((a, b) => b.length - a.length).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = String(text || "").split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return parts.map((part, index) => normalizedTerms.has(part.toLocaleLowerCase())
    ? <mark key={index} className="rounded-sm bg-yellow-300 px-0.5 text-black dark:bg-yellow-400">{part}</mark>
    : part);
}

const COLLECTOR_STATE_LABELS = { offline: "ไม่พร้อม", standby: "สแตนบาย", running: "กำลังอ่าน" };

const ACCESS_LABELS = { ready: "พร้อมใช้งาน", no_worker: "ไม่มีเครื่องรองรับ", logged_out: "Session หลุด", needs_join: "ยังไม่เข้ากลุ่ม", checkpoint: "ต้องยืนยันตัวตน", error: "ตรวจไม่สำเร็จ", unknown: "ไม่ทราบสถานะ", unchecked: "ยังไม่ตรวจ" };
const WORKER_LABELS = { ready: "ออนไลน์", offline: "ออฟไลน์", logged_out: "ออฟไลน์", checkpoint: "ต้องตรวจสอบ", unknown: "ไม่ทราบสถานะ" };
const RISK_LABELS = { offline: "ยังไม่มีเครื่องทำงาน", low: "ภาระต่ำ", medium: "ภาระปานกลาง", high: "ภาระสูง" };

export default function SocialFeedPage() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [folder, setFolder] = useState("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [dateFromInput, setDateFromInput] = useState("");
  const [dateToInput, setDateToInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [tab, setTab] = useState("feed");
  const [savePost, setSavePost] = useState(null);
  const [commentPost, setCommentPost] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceCategoryId, setSourceCategoryId] = useState("");
  const [checkingSessions, setCheckingSessions] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteSourceTarget, setDeleteSourceTarget] = useState(null);
  const [deletingSources, setDeletingSources] = useState(false);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [editingFolderId, setEditingFolderId] = useState("");
  const [editingFolderName, setEditingFolderName] = useState("");
  const [settingRunning, setSettingRunning] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (folder !== "all") params.set("folder", folder);
    if (savedOnly) params.set("saved", "true");
    if (query) params.set("q", query);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", String(page));
    params.set("pageSize", pageSize);
    try {
      const result = await apiJson(`/api/social-feed?${params}`, { fallbackError: "โหลด Social Feed ไม่สำเร็จ" });
      setData(result); setError("");
      if (result.pagination?.page > result.pagination?.totalPages) setPage(result.pagination.totalPages);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [category, folder, savedOnly, query, dateFrom, dateTo, page, pageSize]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- filter changes intentionally start a server refresh
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => load(true), 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const sourcesByCategory = useMemo(() => data.categories.map((item) => ({
    ...item, sources: data.sources.filter((source) => source.categoryId === item.id),
  })), [data.categories, data.sources]);
  const parkedSources = data.sources.filter((source) => source.queueState === "needs_assignment");
  const activeFolder = data.folders.find((item) => item.id === folder) || null;

  const assignSource = async (sourceId, accountId) => {
    try {
      await apiJson("/api/social-feed/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, accountId }), fallbackError: "เลือกเครื่องรับคิวไม่สำเร็จ" });
      await load(true);
    } catch (err) { setError(err.message); }
  };

  const renameFolder = async (id, name) => {
    const clean = String(name || "").trim();
    if (!clean) return;
    setError("");
    try {
      await apiJson("/api/social-feed/folders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: clean }), fallbackError: "เปลี่ยนชื่อโฟลเดอร์ไม่สำเร็จ" });
      setEditingFolderId("");
      await load(true);
    } catch (err) { setError(err.message); }
  };

  const deleteFolder = async (id) => {
    setError("");
    try {
      await apiJson(`/api/social-feed/folders?id=${id}`, { method: "DELETE", fallbackError: "ลบโฟลเดอร์ไม่สำเร็จ" });
      if (folder === id) { setFolder("all"); setSavedOnly(false); }
      await load(true);
    } catch (err) { setError(err.message); }
  };

  const deleteAllPosts = async () => {
    setDeletingAll(true); setError("");
    try {
      await apiJson("/api/social-feed", { method: "DELETE", fallbackError: "ลบโพสต์ทั้งหมดไม่สำเร็จ" });
      setDeleteAllOpen(false);
      await load(true);
    } catch (err) { setError(err.message); }
    finally { setDeletingAll(false); }
  };

  const deleteSources = async () => {
    setDeletingSources(true); setError("");
    try {
      const query = deleteSourceTarget?.id ? `?id=${deleteSourceTarget.id}` : "";
      await apiJson(`/api/social-feed/sources${query}`, { method: "DELETE", fallbackError: "ลบกลุ่ม Facebook ไม่สำเร็จ" });
      setDeleteSourceTarget(null);
      await load(true);
    } catch (err) { setError(err.message); }
    finally { setDeletingSources(false); }
  };

  const deleteCategory = async () => {
    setDeletingCategory(true); setError("");
    try {
      await apiJson(`/api/social-feed/categories?id=${deleteCategoryTarget.id}`, { method: "DELETE", fallbackError: "ลบหมวดหมู่ไม่สำเร็จ" });
      setDeleteCategoryTarget(null);
      await load(true);
    } catch (err) { setError(err.message); }
    finally { setDeletingCategory(false); }
  };

  const deleteWorker = async (id) => {
    setError("");
    try {
      await apiJson(`/api/social-feed/accounts?id=${id}`, { method: "DELETE", fallbackError: "ลบเครื่องไม่สำเร็จ" });
      await load(true);
    } catch (err) { setError(err.message); }
  };

  const openFolder = (folderId) => { setFolder(folderId); setSavedOnly(false); setPage(1); setTab("feed"); };
  const openAllSaved = () => { setFolder("all"); setSavedOnly(true); setPage(1); setTab("feed"); };
  const clearFolderFilter = () => { setFolder("all"); setSavedOnly(false); setPage(1); };
  const setRunning = async (next) => {
    setSettingRunning(true); setError("");
    try {
      await apiJson("/api/social-feed/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ running: next }), fallbackError: "เปลี่ยนสถานะการอ่านไม่สำเร็จ" });
      await load(true);
    } catch (err) { setError(err.message); }
    finally { setSettingRunning(false); }
  };
  const checkSessions = () => {
    setCheckingSessions(true); setError("");
    let acknowledged = false;
    const listener = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "INBLACKM_SOCIAL_CHECK_STARTED") acknowledged = true;
      if (event.data?.type !== "INBLACKM_SOCIAL_CHECK_FINISHED") return;
      window.removeEventListener("message", listener); setCheckingSessions(false);
      if (!event.data.result?.ok) setError(event.data.result?.error || "Extension ตรวจ Session ไม่สำเร็จ");
      load(true);
    };
    window.addEventListener("message", listener);
    window.postMessage({ type: "INBLACKM_SOCIAL_CHECK" }, window.location.origin);
    window.setTimeout(() => {
      if (acknowledged) return;
      window.removeEventListener("message", listener); setCheckingSessions(false);
      setError("ไม่พบ Social Feed Collector Extension — ติดตั้งหรือเปิด Extension ก่อน");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Radio /></span>
            <div><p className="font-semibold tracking-tight">Feed Social</p><p className="text-xs text-muted-foreground">Facebook text monitor</p></div>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const online = data.collectorSummary.activeCollectorCount > 0;
              const state = !online ? "offline" : data.collectorSummary.running ? "running" : "standby";
              return (<>
                <Badge variant={state === "running" ? "default" : "outline"}><CircleDot data-icon="inline-start" />{COLLECTOR_STATE_LABELS[state]}</Badge>
                {state === "running"
                  ? <Button variant="outline" size="sm" onClick={() => setRunning(false)} disabled={settingRunning}><Square data-icon="inline-start" />หยุด</Button>
                  : <Button size="sm" onClick={() => setRunning(true)} disabled={!online || settingRunning}><Play data-icon="inline-start" />เริ่ม</Button>}
              </>);
            })()}
            <Button variant="outline" size="icon" nativeButton={false} render={<Link href="/" />} aria-label="กลับเมนู"><LayoutGrid /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <section className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">จับข้อความที่ต้องใช้<br />ก่อนโพสต์จะไหลผ่านไป</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">รวมโพสต์จาก {data.sources.length} กลุ่ม เรียงตามเวลาโพสต์จากใหม่ไปเก่า โพสต์ที่ยังไม่ทราบเวลาจะแสดงไว้ท้ายฟีด</p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div><p className="text-2xl font-semibold tabular-nums">{data.pagination.total}</p><p className="text-muted-foreground">โพสต์ทั้งหมด</p></div>
          </div>
        </section>

        {error && <Alert variant="destructive"><AlertTitle>โหลดข้อมูลไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

        <Tabs value={tab} onValueChange={(value) => { setTab(value); setPage(1); }}>
          <TabsList variant="line">
            <TabsTrigger value="feed"><Radio data-icon="inline-start" />ฟีด</TabsTrigger>
            <TabsTrigger value="saved"><Bookmark data-icon="inline-start" />บันทึกไว้</TabsTrigger>
            <TabsTrigger value="sources"><ExternalLink data-icon="inline-start" />แหล่งข้อมูล</TabsTrigger>
            <TabsTrigger value="workers"><Monitor data-icon="inline-start" />เครื่องอ่าน</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="pt-4">
            <div className="grid gap-6 lg:grid-cols-1">

              <section className="min-w-0">
                <div className="mb-3 grid gap-3 xl:grid-cols-3"><form className="flex flex-wrap items-end gap-2 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}><label className="min-w-52 flex-1 text-xs text-muted-foreground">ค้นหาข้อความในโพสต์<Input className="mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ข้อความในโพสต์" /></label><Button type="submit"><Search data-icon="inline-start" />ค้นหา</Button><Button type="button" variant="outline" disabled={!search && !query} onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>ล้างค้นหา</Button></form><div className="flex items-end gap-2 rounded-lg border p-3"><label className="min-w-52 flex-1 text-xs text-muted-foreground">กรองตามหมวดหมู่<Select items={[{ value: "all", label: "ทุกหมวดหมู่" }, ...data.categories.map((item) => ({ value: item.id, label: item.name }))]} value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">ทุกหมวดหมู่</SelectItem>{data.categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></label></div><form className="flex flex-wrap items-end gap-2 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); setDateFrom(dateFromInput); setDateTo(dateToInput); setPage(1); }}><label className="min-w-36 flex-1 text-xs text-muted-foreground">ตั้งแต่วันที่<Input className="mt-1" type="date" value={dateFromInput} onChange={(event) => setDateFromInput(event.target.value)} /></label><label className="min-w-36 flex-1 text-xs text-muted-foreground">ถึงวันที่<Input className="mt-1" type="date" value={dateToInput} min={dateFromInput || undefined} onChange={(event) => setDateToInput(event.target.value)} /></label><Button type="submit">กรองวันที่</Button><Button type="button" variant="outline" disabled={!dateFromInput && !dateToInput && !dateFrom && !dateTo} onClick={() => { setDateFromInput(""); setDateToInput(""); setDateFrom(""); setDateTo(""); setPage(1); }}>ล้างวันที่</Button></form></div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground"><Filter className="mr-1 inline size-4" />พบ {data.pagination.total} {savedOnly || activeFolder ? "โพสต์ที่บันทึก" : "โพสต์"}</p>{(activeFolder || savedOnly) && <Badge variant="secondary" className="gap-1"><Folder className="size-3.5" />{activeFolder ? activeFolder.name : "ทั้งหมดที่บันทึก"}<button type="button" aria-label="ล้างตัวกรองโฟลเดอร์" className="ml-0.5 hover:text-foreground" onClick={clearFolderFilter}><X className="size-3.5" /></button></Badge>}</div><div className="flex items-center gap-2">{data.refreshedAt && <p className="text-xs text-muted-foreground">ล่าสุด {formatTime(data.refreshedAt)}</p>}{!savedOnly && !activeFolder && <Button variant="destructive" size="sm" onClick={() => setDeleteAllOpen(true)} disabled={!data.pagination.total || deletingAll}><Trash2 data-icon="inline-start" />ลบโพสต์ทั้งหมด</Button>}</div></div>
                <FeedPagination pagination={data.pagination} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} onPageChange={setPage} />
                {loading ? <div className="flex flex-col gap-3">{[1,2,3].map((item) => <Skeleton key={item} className="h-40 w-full" />)}</div> : data.posts.length === 0 ? <Card><CardHeader><CardTitle>{savedOnly || activeFolder ? "ยังไม่มีโพสต์ที่บันทึก" : "ยังไม่มีโพสต์"}</CardTitle><CardDescription>{activeFolder ? "ยังไม่มีโพสต์ในโฟลเดอร์นี้ — กดไอคอนบันทึกที่โพสต์แล้วเลือกโฟลเดอร์นี้" : savedOnly ? "กดไอคอนบันทึกที่โพสต์แล้วเลือกโฟลเดอร์ โพสต์จะแสดงที่นี่" : "ลองเปลี่ยนตัวกรอง หรือรอรอบอัปเดตถัดไป"}</CardDescription></CardHeader></Card> : <div className="flex flex-col gap-3">
                  {data.posts.map((post) => <article key={post.id} className="group rounded-xl border bg-card p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{post.sourceName}</p>{post.authorName && <p className="mt-1 text-sm font-medium">{post.authorName}</p>}<p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" />{formatPostTime(post.postedAt, now)}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="คอมเมนต์โพสต์" onClick={() => setCommentPost(post)}><MessageCircle /></Button><Button variant="ghost" size="icon" aria-label={post.saved ? "แก้ไขโฟลเดอร์ที่บันทึก" : "บันทึกโพสต์"} onClick={() => setSavePost(post)}>{post.saved ? <BookmarkCheck /> : <Bookmark />}</Button></div></div>
                    <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7"><HighlightedText text={post.message} query={query} /></p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div className="flex flex-wrap gap-1.5">{post.folders.map((item) => <Button key={item.id} variant="outline" size="xs" onClick={() => openFolder(item.id)}><Folder data-icon="inline-start" />{item.name}</Button>)}</div><Button variant="link" size="sm" nativeButton={false} render={<a href={post.originalUrl} target="_blank" rel="noreferrer" />}>เปิดต้นโพสต์<ArrowUpRight data-icon="inline-end" /></Button></div>
                  </article>)}
                  <FeedPagination pagination={data.pagination} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} onPageChange={setPage} />
                </div>}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="saved" className="pt-4">
            <div className="mb-4"><p className="font-medium">โฟลเดอร์ที่บันทึก</p><p className="text-sm text-muted-foreground">กดไอคอนบันทึกที่โพสต์เพื่อโยนเข้าโฟลเดอร์ สร้างใหม่หรือเลือกที่มีอยู่ได้</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card size="sm" className="cursor-pointer" onClick={openAllSaved}><CardHeader><CardTitle className="flex items-center gap-2"><Bookmark />ทั้งหมดที่บันทึก</CardTitle><CardDescription>โพสต์ทุกโฟลเดอร์รวมกัน</CardDescription><CardAction><ArrowUpRight /></CardAction></CardHeader></Card>
              {data.folders.map((item) => <Card key={item.id} size="sm"><CardHeader>{editingFolderId === item.id
                ? <div className="flex items-center gap-2"><Folder className="size-4 shrink-0 text-muted-foreground" /><Input autoFocus value={editingFolderName} onChange={(event) => setEditingFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); renameFolder(item.id, editingFolderName); } if (event.key === "Escape") setEditingFolderId(""); }} className="h-8" /><Button variant="ghost" size="icon-sm" aria-label="บันทึกชื่อ" onClick={() => renameFolder(item.id, editingFolderName)} disabled={!editingFolderName.trim()}><Check /></Button><Button variant="ghost" size="icon-sm" aria-label="ยกเลิก" onClick={() => setEditingFolderId("")}><X /></Button></div>
                : <><CardTitle className="flex items-center gap-2"><Folder />{item.name}</CardTitle><CardDescription>{item.count} โพสต์</CardDescription><CardAction className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`เปลี่ยนชื่อ ${item.name}`} onClick={() => { setEditingFolderId(item.id); setEditingFolderName(item.name); }}><Pencil /></Button><Button variant="ghost" size="icon-sm" aria-label={`ลบโฟลเดอร์ ${item.name}`} onClick={() => setDeleteFolderTarget(item)}><Trash2 /></Button></CardAction></>}
              </CardHeader><CardContent><Button variant="outline" size="sm" onClick={() => openFolder(item.id)}><Folder data-icon="inline-start" />เปิดดูโพสต์</Button></CardContent></Card>)}
            </div>
            {!data.folders.length && <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีโฟลเดอร์ — กดไอคอนบันทึกที่โพสต์แล้วสร้างโฟลเดอร์แรกได้เลย</p>}
          </TabsContent>

          <TabsContent value="sources" className="pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">หมวดหมู่และกลุ่มที่ติดตาม</p><p className="text-sm text-muted-foreground">เพิ่มกลุ่มใหม่แล้วใช้ Group ID เดียวกันกับ collector</p></div>
              <div className="flex flex-wrap gap-2"><Button variant="outline" nativeButton={false} render={<a href="/social-feed-collector.zip" download />}><Download data-icon="inline-start" />ดาวน์โหลด Extension</Button><Button variant="outline" onClick={() => setCategoryOpen(true)}><FolderPlus data-icon="inline-start" />เพิ่มหมวดหมู่</Button><Button variant="destructive" onClick={() => setDeleteSourceTarget({ all: true })} disabled={!data.categories.length || deletingSources}><Trash2 data-icon="inline-start" />ลบทุกกลุ่ม</Button><Button onClick={() => { setSourceCategoryId(""); setSourceOpen(true); }}><Plus data-icon="inline-start" />เพิ่มกลุ่ม</Button></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">{sourcesByCategory.map((group) => <Card key={group.id}><CardHeader><CardTitle>{group.name}</CardTitle><CardDescription>{group.sources.length} กลุ่ม Facebook</CardDescription><CardAction className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`เพิ่มกลุ่ม Facebook ใน ${group.name}`} onClick={() => { setSourceCategoryId(group.id); setSourceOpen(true); }}><Plus /></Button><Button variant="ghost" size="icon-sm" aria-label={`ลบหมวดหมู่ ${group.name}`} onClick={() => setDeleteCategoryTarget(group)}><Trash2 /></Button></CardAction></CardHeader><CardContent className="flex flex-col gap-2">{group.sources.map((source) => <div key={source.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm"><div className="flex items-start justify-between gap-3"><a href={source.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium hover:underline"><span>{source.name}</span><ExternalLink className="ml-1 inline size-4" /></a><Button variant="ghost" size="icon-sm" aria-label={`ลบ ${source.name}`} onClick={() => setDeleteSourceTarget(source)}><Trash2 /></Button></div><div className="flex flex-wrap items-center gap-2"><Badge variant={source.accessStatus === "ready" ? "default" : "destructive"}>{ACCESS_LABELS[source.accessStatus] || ACCESS_LABELS.unknown}</Badge></div>{source.sessionCheckedAt && <span className="text-xs text-muted-foreground">ตรวจล่าสุด {formatTime(source.sessionCheckedAt)}</span>}</div>)}</CardContent></Card>)}</div>
          </TabsContent>

          <TabsContent value="workers" className="pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">เครื่องที่เข้าระบบ</p><p className="text-sm text-muted-foreground">ทั้งหมด {data.accounts.length} เครื่อง · ออนไลน์ {data.collectorSummary.activeCollectorCount} เครื่อง</p></div><Button variant="outline" onClick={checkSessions} disabled={checkingSessions}><RefreshCw data-icon="inline-start" className={checkingSessions ? "animate-spin" : ""} />{checkingSessions ? "กำลังเช็ค..." : "สั่งดึงโพสต์ตอนนี้"}</Button></div>
            <Card className="mb-4"><CardHeader><CardTitle>คิวการดึง</CardTitle><CardDescription>{data.collectorSummary.enabledSourceCount} กลุ่ม · ประมาณ {data.collectorSummary.sourcesPerCollector} กลุ่มต่อเครื่องในแต่ละรอบ</CardDescription><CardAction><Badge variant={data.collectorSummary.riskLevel === "low" ? "default" : "outline"}>{RISK_LABELS[data.collectorSummary.riskLevel] || RISK_LABELS.offline}</Badge></CardAction></CardHeader><CardContent><p className="text-xs text-muted-foreground">เครื่องที่ไม่ส่งสถานะเกิน 10 นาทีจะแสดงเป็นออฟไลน์ และคิวจะย้ายให้เครื่องที่ยังออนไลน์ในรอบถัดไป</p></CardContent></Card>
            {parkedSources.length > 0 && <Card className="mb-4 border-destructive/50"><CardHeader><CardTitle>กลุ่มที่ยังไม่ได้เข้าร่วม</CardTitle><CardDescription>{parkedSources.length} กลุ่มถูกพักและจะไม่เข้าคิวจนกว่าจะเลือกเครื่อง</CardDescription><CardAction><Badge variant="destructive">รอเลือกเครื่อง</Badge></CardAction></CardHeader><CardContent className="flex flex-col gap-3">{parkedSources.map((source) => { const eligibleAccounts = data.accounts.filter((account) => account.platformAccountId); return <div key={source.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><a href={source.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">{source.name}</a><p className="text-xs text-muted-foreground">{source.accessNote || "Extension พบว่ายังไม่ได้เข้าร่วมกลุ่มส่วนตัว"}</p></div><Select items={eligibleAccounts.map((account) => ({ value: account.id, label: account.label }))} value={null} onValueChange={(accountId) => assignSource(source.id, accountId)}><SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="เลือกเครื่องรับคิว" /></SelectTrigger><SelectContent><SelectGroup>{eligibleAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label}{account.status === "ready" ? " · ออนไลน์" : " · ออฟไลน์"}</SelectItem>)}</SelectGroup></SelectContent></Select></div>; })}</CardContent></Card>}
            {data.accounts.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map((worker) => <Card key={worker.id}><CardHeader><CardTitle className="flex items-center gap-2"><Monitor />{worker.label}</CardTitle><CardDescription>{worker.platformAccountId ? `Facebook ID ${worker.platformAccountId}` : "เครื่องอ่าน Public"} · รหัส {worker.instanceId.slice(0, 8)}</CardDescription><CardAction><Badge variant={worker.status === "ready" ? "default" : "outline"}>{WORKER_LABELS[worker.status] || WORKER_LABELS.unknown}</Badge></CardAction></CardHeader><CardContent className="flex flex-col gap-3">{worker.currentSource && <div className="rounded-md border bg-muted/40 p-2 text-xs"><p className="mb-1 text-muted-foreground">กำลังอ่านอยู่</p><a href={worker.currentSource.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{worker.currentSource.name}</a></div>}<div className="text-xs text-muted-foreground"><p>คิวรอบนี้ {worker.assignedSourceCount} กลุ่ม</p><p>ติดต่อครั้งล่าสุด {formatTime(worker.lastSeenAt)}</p></div>{worker.assignedSources?.length > 0 && <div className="flex flex-col gap-1 border-t pt-3">{worker.assignedSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="truncate text-xs hover:underline">{source.name}</a>)}</div>}<div className="flex flex-wrap gap-2 border-t pt-3"><Button variant="ghost" size="sm" onClick={() => deleteWorker(worker.id)}><Trash2 data-icon="inline-start" />ลบออก</Button></div></CardContent></Card>)}</div> : <Card><CardHeader><CardTitle>ยังไม่มีเครื่องเข้าระบบ</CardTitle><CardDescription>ติดตั้ง Extension แล้วกด “เชื่อมต่อ” เครื่องจะขึ้นสแตนบายในหน้านี้ แล้วกด “เริ่ม” ด้านบนเพื่อสั่งให้อ่าน</CardDescription></CardHeader></Card>}
          </TabsContent>
        </Tabs>
      </main>

      <SaveDialog key={`save-${savePost?.id || "closed"}`} post={savePost} folders={data.folders} onOpenChange={(open) => !open && setSavePost(null)} onSaved={() => load(true)} />
      <CommentDialog key={`comment-${commentPost?.id || "closed"}`} post={commentPost} accounts={data.accounts.filter((account) => account.status === "ready" && account.platformAccountId)} onOpenChange={(open) => !open && setCommentPost(null)} />
      <AlertDialog open={Boolean(deleteFolderTarget)} onOpenChange={(open) => { if (!open) setDeleteFolderTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบโฟลเดอร์ {deleteFolderTarget?.name}?</AlertDialogTitle><AlertDialogDescription>โพสต์จะยังอยู่ในฟีด แต่จะถูกนำออกจากโฟลเดอร์นี้ทั้งหมด — การกระทำนี้ย้อนกลับไม่ได้</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { const target = deleteFolderTarget; setDeleteFolderTarget(null); if (target) deleteFolder(target.id); }}><Trash2 data-icon="inline-start" />ยืนยันลบโฟลเดอร์</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={deleteAllOpen} onOpenChange={(open) => { if (!deletingAll) setDeleteAllOpen(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบโพสต์ทั้งหมด?</AlertDialogTitle><AlertDialogDescription>โพสต์ที่เก็บไว้ รวมถึงสถานะบันทึกในโฟลเดอร์ที่ผูกกับโพสต์จะถูกลบทั้งหมด แต่กลุ่ม โฟลเดอร์ บัญชี Bot และการตั้งค่าจะยังอยู่ โพสต์อาจถูกดึงกลับมาใหม่ในรอบถัดไป</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingAll}>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingAll} onClick={deleteAllPosts}><Trash2 data-icon="inline-start" />{deletingAll ? "กำลังลบ..." : "ยืนยันลบทั้งหมด"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(deleteSourceTarget)} onOpenChange={(open) => { if (!open && !deletingSources) setDeleteSourceTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleteSourceTarget?.all ? "ลบทุกหมวดหมู่และกลุ่ม Facebook?" : `ลบ ${deleteSourceTarget?.name || "กลุ่มนี้"}?`}</AlertDialogTitle><AlertDialogDescription>{deleteSourceTarget?.all ? "หมวดหมู่และกลุ่ม Facebook ทั้งหมด รวมถึงโพสต์ กฎ และสถานะตรวจสอบที่ผูกไว้จะถูกลบ แต่โฟลเดอร์และบัญชี Bot จะยังอยู่" : "กลุ่มนี้ รวมถึงโพสต์และสถานะตรวจสอบที่ผูกไว้จะถูกลบออกจาก Feed Social"}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingSources}>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingSources} onClick={deleteSources}><Trash2 data-icon="inline-start" />{deletingSources ? "กำลังลบ..." : "ยืนยันลบ"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(deleteCategoryTarget)} onOpenChange={(open) => { if (!open && !deletingCategory) setDeleteCategoryTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบหมวดหมู่ {deleteCategoryTarget?.name}?</AlertDialogTitle><AlertDialogDescription>หมวดหมู่นี้ รวมถึงกลุ่ม Facebook โพสต์ และสถานะตรวจสอบทั้งหมดที่อยู่ภายในจะถูกลบถาวร</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingCategory}>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingCategory} onClick={deleteCategory}><Trash2 data-icon="inline-start" />{deletingCategory ? "กำลังลบ..." : "ยืนยันลบหมวดหมู่"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} onSaved={() => load(true)} />
      <SourceDialog key={`${sourceCategoryId || "all"}-${sourceOpen}`} open={sourceOpen} onOpenChange={setSourceOpen} categories={data.categories} initialCategoryId={sourceCategoryId} onSaved={() => load(true)} />
    </div>
  );
}

function FeedPagination({ pagination, pageSize, onPageSizeChange, onPageChange }) {
  return <div className="my-3 flex flex-wrap items-center justify-center gap-3"><Select items={[{ value: "20", label: "20 ต่อหน้า" }, { value: "50", label: "50 ต่อหน้า" }, { value: "100", label: "100 ต่อหน้า" }, { value: "all", label: "ทั้งหมด (สูงสุด 1,000)" }]} value={pageSize} onValueChange={onPageSizeChange}><SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="20">20 ต่อหน้า</SelectItem><SelectItem value="50">50 ต่อหน้า</SelectItem><SelectItem value="100">100 ต่อหน้า</SelectItem><SelectItem value="all">ทั้งหมด (สูงสุด 1,000)</SelectItem></SelectGroup></SelectContent></Select>{pageSize === "all" ? <span className="text-sm text-muted-foreground">แสดง {pagination.shown ?? pagination.total} จาก {pagination.total} โพสต์</span> : <><Button variant="outline" size="sm" onClick={() => onPageChange((value) => Math.max(1, value - 1))} disabled={pagination.page <= 1}><ChevronLeft data-icon="inline-start" />ก่อนหน้า</Button><span className="text-sm tabular-nums text-muted-foreground">หน้า {pagination.page} / {pagination.totalPages}</span><Button variant="outline" size="sm" onClick={() => onPageChange((value) => Math.min(pagination.totalPages, value + 1))} disabled={pagination.page >= pagination.totalPages}>ถัดไป<ChevronRight data-icon="inline-end" /></Button></>}</div>;
}


function SaveDialog({ post, folders, onOpenChange, onSaved }) {
  const [selected, setSelected] = useState(() => new Set((post?.folders || []).map((item) => item.id)));
  const [created, setCreated] = useState([]);
  const [renamed, setRenamed] = useState({});
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const available = useMemo(() => { const map = new Map(folders.map((item) => [item.id, item])); for (const item of created) if (!map.has(item.id)) map.set(item.id, item); return [...map.values()].map((item) => renamed[item.id] ? { ...item, name: renamed[item.id] } : item); }, [folders, created, renamed]);
  const toggle = (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renameFolder = async (id) => {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true); setError("");
    try {
      const folder = await apiJson("/api/social-feed/folders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }), fallbackError: "เปลี่ยนชื่อไม่สำเร็จ" });
      setRenamed((prev) => ({ ...prev, [id]: folder.name }));
      setEditingId(""); onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const createFolder = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true); setError("");
    try {
      const folder = await apiJson("/api/social-feed/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }), fallbackError: "สร้างโฟลเดอร์ไม่สำเร็จ" });
      setCreated((prev) => prev.some((item) => item.id === folder.id) ? prev : [...prev, folder]);
      setSelected((prev) => new Set(prev).add(folder.id));
      setNewName("");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      await apiJson(`/api/social-feed/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folders: [...selected] }), fallbackError: "บันทึกไม่สำเร็จ" });
      onOpenChange(false); onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <Dialog open={Boolean(post)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>บันทึกเข้าโฟลเดอร์</DialogTitle><DialogDescription>เลือกโฟลเดอร์ที่จะเก็บโพสต์นี้ หรือสร้างใหม่ — เลือกได้หลายโฟลเดอร์</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field><div className="flex gap-2"><Input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createFolder(); } }} placeholder="สร้างโฟลเดอร์ใหม่ เช่น ลูกค้าใหม่" /><Button variant="outline" onClick={createFolder} disabled={busy || !newName.trim()}><FolderPlus data-icon="inline-start" />สร้าง</Button></div></Field>{available.length > 0 && <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">{available.map((item) => editingId === item.id
  ? <div key={item.id} className="flex items-center gap-2 rounded-md border p-2"><Folder className="size-4 shrink-0 text-muted-foreground" /><Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); renameFolder(item.id); } if (event.key === "Escape") setEditingId(""); }} className="h-8" /><Button variant="ghost" size="icon-sm" aria-label="บันทึกชื่อ" onClick={() => renameFolder(item.id)} disabled={busy || !editingName.trim()}><Check /></Button><Button variant="ghost" size="icon-sm" aria-label="ยกเลิก" onClick={() => setEditingId("")}><X /></Button></div>
  : <div key={item.id} role="button" tabIndex={0} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted" onClick={() => toggle(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(item.id); } }}><Checkbox checked={selected.has(item.id)} className="pointer-events-none" /><Folder className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{item.name}</span><button type="button" aria-label={`เปลี่ยนชื่อ ${item.name}`} className="shrink-0 text-muted-foreground hover:text-foreground" onClick={(event) => { event.stopPropagation(); setEditingId(item.id); setEditingName(item.name); }}><Pencil className="size-3.5" /></button></div>)}</div>}{!available.length && <FieldDescription>ยังไม่มีโฟลเดอร์ — พิมพ์ชื่อด้านบนแล้วกด “สร้าง”</FieldDescription>}</FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={save} disabled={busy}><Check data-icon="inline-start" />{busy ? "กำลังบันทึก..." : "บันทึก"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CommentDialog({ post, accounts, onOpenChange }) {
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true); setError("");
    try {
      await apiJson("/api/social-feed/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.id, accountId, text }), fallbackError: "สร้างงานคอมเมนต์ไม่สำเร็จ" });
      onOpenChange(false);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <Dialog open={Boolean(post)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>คอมเมนต์ผ่าน Extension</DialogTitle><DialogDescription>Extension จะใช้บัญชี Facebook ที่เชื่อมกับเครื่องที่เลือกส่งข้อความนี้หนึ่งครั้ง</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field><FieldLabel>เครื่อง/บัญชี</FieldLabel><Select items={accounts.map((account) => ({ value: account.id, label: `${account.label} · Facebook ${account.platformAccountId}` }))} value={accountId} onValueChange={setAccountId}><SelectTrigger className="w-full"><SelectValue placeholder="เลือกเครื่อง" /></SelectTrigger><SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label} · Facebook {account.platformAccountId}</SelectItem>)}</SelectGroup></SelectContent></Select>{!accounts.length && <FieldDescription>ยังไม่มี Extension ที่ออนไลน์และเชื่อมบัญชี Facebook</FieldDescription>}</Field><Field><FieldLabel>ข้อความคอมเมนต์</FieldLabel><textarea className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} maxLength={8000} /></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={submit} disabled={saving || !accountId || !text.trim()}><MessageCircle data-icon="inline-start" />{saving ? "กำลังเข้าคิว..." : "ส่งคอมเมนต์"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CategoryDialog({ open, onOpenChange, onSaved }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await apiJson("/api/social-feed/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }), fallbackError: "เพิ่มหมวดหมู่ไม่สำเร็จ" });
      setName(""); setError(""); onOpenChange(false); onSaved();
    } catch (err) { setError(err.message); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>เพิ่มหมวดหมู่</DialogTitle><DialogDescription>สร้างหมวดหมู่ก่อน แล้วจึงเพิ่มกลุ่ม Facebook เข้าไป</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field data-invalid={Boolean(error)}><FieldLabel>ชื่อหมวดหมู่</FieldLabel><Input value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error)} placeholder="เช่น Wuthering Waves" /></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={save} disabled={!name.trim()}><Check data-icon="inline-start" />เพิ่มหมวดหมู่</Button></DialogFooter></DialogContent></Dialog>;
}

function SourceDialog({ open, onOpenChange, categories, initialCategoryId = "", onSaved }) {
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [name, setName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await apiJson("/api/social-feed/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: categoryId || categories[0]?.id, name, facebookUrl }), fallbackError: "เพิ่มกลุ่ม Facebook ไม่สำเร็จ" });
      setName(""); setFacebookUrl(""); setError(""); onOpenChange(false); onSaved();
    } catch (err) { setError(err.message); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>เพิ่มกลุ่ม Facebook</DialogTitle><DialogDescription>บัญชี Bot ที่ Login ไว้จะดึงโพสต์จากกลุ่มนี้อัตโนมัติ</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field><FieldLabel>หมวดหมู่</FieldLabel><Select items={categories.map((item) => ({ value: item.id, label: item.name }))} value={categoryId || categories[0]?.id || ""} onValueChange={setCategoryId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>ชื่อกลุ่ม</FieldLabel><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="ชื่อที่ต้องการแสดง" /></Field><Field data-invalid={Boolean(error)}><FieldLabel>ลิงก์ Facebook Group</FieldLabel><Input type="url" value={facebookUrl} onChange={(event) => setFacebookUrl(event.target.value)} aria-invalid={Boolean(error)} placeholder="https://www.facebook.com/groups/123456789/" /><FieldDescription>รองรับทั้ง Group ID และ slug เช่น lineagew.th</FieldDescription></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={save} disabled={!categories.length || !name.trim() || !facebookUrl.trim()}><Check data-icon="inline-start" />เพิ่มกลุ่ม</Button></DialogFooter></DialogContent></Dialog>;
}

