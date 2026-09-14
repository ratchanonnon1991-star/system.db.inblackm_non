"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, CircleDot, Clock3, Download, ExternalLink,
  Filter, FolderPlus, Hash, LayoutGrid, LogIn, Monitor, Plus, Radio, RefreshCw, Search, Tags, Trash2, UserRound,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
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

const EMPTY = { categories: [], sources: [], rules: [], tags: [], posts: [], accounts: [], collectorSummary: { activeCollectorCount: 0, enabledSourceCount: 0, sourcesPerCollector: 0, riskLevel: "offline" }, pagination: { page: 1, pageSize: "20", total: 0, totalPages: 1 } };

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

function formatCountdown(value, now) {
  const seconds = Math.max(0, Math.ceil((Number(value) - now) / 1000));
  if (!Number(value)) return "รอข้อมูลจาก Extension";
  if (seconds <= 0) return "กำลังรอดึงโพสต์";
  return `ดึงโพสต์ใน ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} นาที`;
}


const ACCESS_LABELS = { ready: "พร้อมใช้งาน", logged_out: "Session หลุด", needs_join: "ยังไม่เข้ากลุ่ม", checkpoint: "ต้องยืนยันตัวตน", error: "ตรวจไม่สำเร็จ", unknown: "ไม่ทราบสถานะ", unchecked: "ยังไม่ตรวจ" };
const ACCOUNT_LABELS = { ...ACCESS_LABELS, offline: "Extension ออฟไลน์" };
const WORKER_LABELS = { ready: "ออนไลน์", offline: "ออฟไลน์", logged_out: "ออฟไลน์", checkpoint: "ต้องตรวจสอบ", unknown: "ไม่ทราบสถานะ" };
const RISK_LABELS = { offline: "ยังไม่มีเครื่องทำงาน", low: "ภาระต่ำ", medium: "ภาระปานกลาง", high: "ภาระสูง" };

export default function SocialFeedPage() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [tag, setTag] = useState("all");
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
  const [tagPost, setTagPost] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceCategoryId, setSourceCategoryId] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState(null);
  const [checkingSessions, setCheckingSessions] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteSourceTarget, setDeleteSourceTarget] = useState(null);
  const [deletingSources, setDeletingSources] = useState(false);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(false);
  const [collectorTiming, setCollectorTiming] = useState({ lastCheckAt: "", nextCheckAt: 0 });
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (tag !== "all") params.set("tag", tag);
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
  }, [category, tag, savedOnly, query, dateFrom, dateTo, page, pageSize]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- filter changes intentionally start a server refresh
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => load(true), 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const listener = (event) => {
      if (event.origin === window.location.origin && event.data?.type === "INBLACKM_SOCIAL_STATUS_RESULT") setCollectorTiming(event.data.status);
    };
    window.addEventListener("message", listener);
    window.postMessage({ type: "INBLACKM_SOCIAL_STATUS" }, window.location.origin);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener("message", listener); window.clearInterval(timer); };
  }, []);

  const sourcesByCategory = useMemo(() => data.categories.map((item) => ({
    ...item, sources: data.sources.filter((source) => source.categoryId === item.id),
  })), [data.categories, data.sources]);

  const updatePost = async (post, body) => {
    try {
      await apiJson(`/api/social-feed/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), fallbackError: "อัปเดตโพสต์ไม่สำเร็จ" });
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

  const openTag = (selectedTag) => { setTag(selectedTag); setPage(1); setTab("feed"); };
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
  const connectLogin = ({ label, instanceId = "" }) => {
    let acknowledged = false;
    const listener = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "INBLACKM_SOCIAL_LOGIN_STARTED") acknowledged = true;
      if (event.data?.type !== "INBLACKM_SOCIAL_LOGIN_RESULT") return;
      window.removeEventListener("message", listener);
      if (!event.data.result?.ok) setError(event.data.result?.error || "เปิดหน้าต่าง Login ไม่สำเร็จ");
    };
    window.addEventListener("message", listener);
    window.postMessage({ type: "INBLACKM_SOCIAL_LOGIN", label, targetInstanceId: instanceId }, window.location.origin);
    window.setTimeout(() => { if (!acknowledged) { window.removeEventListener("message", listener); setError("ไม่พบ Social Feed Collector Extension — ติดตั้งหรือ Reload Extension ก่อน"); } }, 1500);
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
            <Badge variant="outline"><CircleDot data-icon="inline-start" />{formatCountdown(collectorTiming.nextCheckAt, now)}</Badge>
            <Button variant="outline" size="icon" onClick={() => load()} disabled={refreshing} aria-label="รีเฟรช"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
            <Button variant="outline" size="icon" render={<Link href="/" />} aria-label="กลับเมนู"><LayoutGrid /></Button>
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

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="line">
            <TabsTrigger value="feed"><Radio data-icon="inline-start" />ฟีด</TabsTrigger>
            <TabsTrigger value="tags"><Tags data-icon="inline-start" />ดูตาม Tag</TabsTrigger>
            <TabsTrigger value="sources"><ExternalLink data-icon="inline-start" />แหล่งข้อมูล</TabsTrigger>
            <TabsTrigger value="workers"><Monitor data-icon="inline-start" />เครื่องอ่าน</TabsTrigger>
            <TabsTrigger value="accounts"><UserRound data-icon="inline-start" />บัญชี Bot</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="pt-4">
            <div className="grid gap-6 lg:grid-cols-1">

              <section className="min-w-0">
                <div className="mb-3 grid gap-3 xl:grid-cols-3"><form className="flex flex-wrap items-end gap-2 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}><label className="min-w-52 flex-1 text-xs text-muted-foreground">ค้นหาข้อความในโพสต์<Input className="mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ข้อความในโพสต์" /></label><Button type="submit"><Search data-icon="inline-start" />ค้นหา</Button><Button type="button" variant="outline" disabled={!search && !query} onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>ล้างค้นหา</Button></form><div className="flex items-end gap-2 rounded-lg border p-3"><label className="min-w-52 flex-1 text-xs text-muted-foreground">กรองตามหมวดหมู่<Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">ทุกหมวดหมู่</SelectItem>{data.categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></label></div><form className="flex flex-wrap items-end gap-2 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); setDateFrom(dateFromInput); setDateTo(dateToInput); setPage(1); }}><label className="min-w-36 flex-1 text-xs text-muted-foreground">ตั้งแต่วันที่<Input className="mt-1" type="date" value={dateFromInput} onChange={(event) => setDateFromInput(event.target.value)} /></label><label className="min-w-36 flex-1 text-xs text-muted-foreground">ถึงวันที่<Input className="mt-1" type="date" value={dateToInput} min={dateFromInput || undefined} onChange={(event) => setDateToInput(event.target.value)} /></label><Button type="submit">กรองวันที่</Button><Button type="button" variant="outline" disabled={!dateFromInput && !dateToInput && !dateFrom && !dateTo} onClick={() => { setDateFromInput(""); setDateToInput(""); setDateFrom(""); setDateTo(""); setPage(1); }}>ล้างวันที่</Button></form></div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground"><Filter className="mr-1 inline size-4" />พบ {data.pagination.total} โพสต์</p><div className="flex items-center gap-2">{data.refreshedAt && <p className="text-xs text-muted-foreground">ล่าสุด {formatTime(data.refreshedAt)}</p>}<Button variant="destructive" size="sm" onClick={() => setDeleteAllOpen(true)} disabled={!data.pagination.total || deletingAll}><Trash2 data-icon="inline-start" />ลบโพสต์ทั้งหมด</Button></div></div>
                <FeedPagination pagination={data.pagination} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} onPageChange={setPage} />
                {loading ? <div className="flex flex-col gap-3">{[1,2,3].map((item) => <Skeleton key={item} className="h-40 w-full" />)}</div> : data.posts.length === 0 ? <Card><CardHeader><CardTitle>ยังไม่มีโพสต์</CardTitle><CardDescription>ลองเปลี่ยนตัวกรอง หรือรอรอบอัปเดตถัดไป</CardDescription></CardHeader></Card> : <div className="flex flex-col gap-3">
                  {data.posts.map((post) => <article key={post.id} className="group rounded-xl border bg-card p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{post.sourceName}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 />{formatPostTime(post.postedAt, now)}</p></div><Button variant="ghost" size="icon" aria-label={post.saved ? "ยกเลิกบันทึก" : "บันทึกโพสต์"} onClick={() => updatePost(post, { saved: !post.saved })}>{post.saved ? <BookmarkCheck /> : <Bookmark />}</Button></div>
                    <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7">{post.message}</p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div className="flex flex-wrap gap-1.5">{post.tags.map((item) => <Button key={item.id} variant="outline" size="xs" onClick={() => openTag(item.id)}>#{item.name}</Button>)}<Button variant="ghost" size="xs" onClick={() => setTagPost(post)}><Hash data-icon="inline-start" />ใส่ Tag</Button></div><Button variant="link" size="sm" render={<a href={post.originalUrl} target="_blank" rel="noreferrer" />}>เปิดต้นโพสต์<ArrowUpRight data-icon="inline-end" /></Button></div>
                  </article>)}
                  <FeedPagination pagination={data.pagination} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} onPageChange={setPage} />
                </div>}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="tags" className="pt-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.tags.length ? data.tags.map((item) => <Card key={item.id} size="sm" className="cursor-pointer" onClick={() => openTag(item.id)}><CardHeader><CardTitle>#{item.name}</CardTitle><CardDescription>{item.count} โพสต์</CardDescription><CardAction><ArrowUpRight /></CardAction></CardHeader></Card>) : <p className="text-sm text-muted-foreground">ยังไม่มี Tag — เพิ่มได้จากปุ่ม “ใส่ Tag” ใต้โพสต์</p>}</div></TabsContent>

          <TabsContent value="sources" className="pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">หมวดหมู่และกลุ่มที่ติดตาม</p><p className="text-sm text-muted-foreground">เพิ่มกลุ่มใหม่แล้วใช้ Group ID เดียวกันกับ collector</p></div>
              <div className="flex flex-wrap gap-2"><Button variant="outline" render={<a href="/social-feed-collector.zip" download />}><Download data-icon="inline-start" />ดาวน์โหลด Extension</Button><Button variant="outline" onClick={() => setCategoryOpen(true)}><FolderPlus data-icon="inline-start" />เพิ่มหมวดหมู่</Button><Button variant="destructive" onClick={() => setDeleteSourceTarget({ all: true })} disabled={!data.categories.length || deletingSources}><Trash2 data-icon="inline-start" />ลบทุกกลุ่ม</Button><Button onClick={() => { setSourceCategoryId(""); setSourceOpen(true); }}><Plus data-icon="inline-start" />เพิ่มกลุ่ม</Button></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">{sourcesByCategory.map((group) => <Card key={group.id}><CardHeader><CardTitle>{group.name}</CardTitle><CardDescription>{group.sources.length} กลุ่ม Facebook</CardDescription><CardAction className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`เพิ่มกลุ่ม Facebook ใน ${group.name}`} onClick={() => { setSourceCategoryId(group.id); setSourceOpen(true); }}><Plus /></Button><Button variant="ghost" size="icon-sm" aria-label={`ลบหมวดหมู่ ${group.name}`} onClick={() => setDeleteCategoryTarget(group)}><Trash2 /></Button></CardAction></CardHeader><CardContent className="flex flex-col gap-2">{group.sources.map((source) => <div key={source.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm"><div className="flex items-start justify-between gap-3"><a href={source.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium hover:underline"><span>{source.name}</span><ExternalLink className="ml-1 inline size-4" /></a><Button variant="ghost" size="icon-sm" aria-label={`ลบ ${source.name}`} onClick={() => setDeleteSourceTarget(source)}><Trash2 /></Button></div><div className="flex flex-wrap items-center gap-2"><Badge variant={source.accessStatus === "ready" ? "default" : "outline"}>{ACCESS_LABELS[source.accessStatus] || ACCESS_LABELS.unknown}</Badge></div>{source.sessionCheckedAt && <span className="text-xs text-muted-foreground">ตรวจล่าสุด {formatTime(source.sessionCheckedAt)}</span>}</div>)}</CardContent></Card>)}</div>
          </TabsContent>

          <TabsContent value="workers" className="pt-4">
            <div className="mb-4"><p className="font-medium">เครื่องที่เข้าระบบ</p><p className="text-sm text-muted-foreground">ทั้งหมด {data.accounts.length} เครื่อง · ออนไลน์ {data.collectorSummary.activeCollectorCount} เครื่อง</p></div>
            <Card className="mb-4"><CardHeader><CardTitle>คิวการดึง</CardTitle><CardDescription>{data.collectorSummary.enabledSourceCount} กลุ่ม · ประมาณ {data.collectorSummary.sourcesPerCollector} กลุ่มต่อเครื่องในแต่ละรอบ</CardDescription><CardAction><Badge variant={data.collectorSummary.riskLevel === "low" ? "default" : "outline"}>{RISK_LABELS[data.collectorSummary.riskLevel] || RISK_LABELS.offline}</Badge></CardAction></CardHeader><CardContent><p className="text-xs text-muted-foreground">เครื่องที่ไม่ส่งสถานะเกิน 10 นาทีจะแสดงเป็นออฟไลน์ และคิวจะย้ายให้เครื่องที่ยังออนไลน์ในรอบถัดไป</p></CardContent></Card>
            {data.accounts.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map((worker) => <Card key={worker.id}><CardHeader><CardTitle className="flex items-center gap-2"><Monitor />{worker.label}</CardTitle><CardDescription>รหัสเครื่อง {worker.instanceId.slice(0, 8)}</CardDescription><CardAction><Badge variant={worker.status === "ready" ? "default" : "outline"}>{WORKER_LABELS[worker.status] || WORKER_LABELS.unknown}</Badge></CardAction></CardHeader><CardContent className="flex flex-col gap-3"><div className="text-xs text-muted-foreground"><p>คิวรอบนี้ {worker.assignedSourceCount} กลุ่ม</p><p>ติดต่อครั้งล่าสุด {formatTime(worker.lastSeenAt)}</p></div>{worker.assignedSources?.length > 0 && <div className="flex flex-col gap-1 border-t pt-3">{worker.assignedSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="truncate text-xs hover:underline">{source.name}</a>)}</div>}</CardContent></Card>)}</div> : <Card><CardHeader><CardTitle>ยังไม่มีเครื่องเข้าระบบ</CardTitle><CardDescription>ติดตั้ง Extension แล้วกด “เริ่มอ่าน” เครื่องจะปรากฏในหน้านี้</CardDescription></CardHeader></Card>}
          </TabsContent>

          <TabsContent value="accounts" className="pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">บัญชี Bot</p><p className="text-sm text-muted-foreground">Login ครั้งเดียวใน Chrome profile แล้ว Bot จะใช้บัญชีนี้ดึงโพสต์จากทุกกลุ่มอัตโนมัติ</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={checkSessions} disabled={checkingSessions}><RefreshCw data-icon="inline-start" className={checkingSessions ? "animate-spin" : ""} />{checkingSessions ? "กำลังเช็ค..." : "สั่ง Bot ดึงโพสต์ตอนนี้"}</Button><Button onClick={() => { setLoginTarget(null); setLoginOpen(true); }}><Plus data-icon="inline-start" />เพิ่มบัญชี Bot</Button></div></div>
            <Card className="mb-4"><CardHeader><CardTitle>คิวการดึง</CardTitle><CardDescription>เปิดใช้งาน {data.collectorSummary.activeCollectorCount} เครื่อง · {data.collectorSummary.enabledSourceCount} กลุ่ม · ประมาณ {data.collectorSummary.sourcesPerCollector} กลุ่มต่อเครื่องในแต่ละรอบ</CardDescription><CardAction><Badge variant={data.collectorSummary.riskLevel === "low" ? "default" : "outline"}>{RISK_LABELS[data.collectorSummary.riskLevel] || RISK_LABELS.offline}</Badge></CardAction></CardHeader><CardContent><p className="text-xs text-muted-foreground">ประเมินจากจำนวนกลุ่มต่อเครื่อง: ไม่เกิน 10 ต่ำ, 11–25 ปานกลาง, มากกว่า 25 สูง</p></CardContent></Card>
            {data.accounts.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map((account) => <Card key={account.id}><CardHeader><CardTitle className="flex items-center gap-2"><UserRound />{account.label}</CardTitle><CardDescription>{account.platformAccountId ? `Facebook ID ${account.platformAccountId}` : "เครื่องอ่าน Public"}</CardDescription><CardAction><Badge variant={account.status === "ready" ? "default" : "outline"}>{ACCOUNT_LABELS[account.status] || ACCOUNT_LABELS.unknown}</Badge></CardAction></CardHeader><CardContent className="flex flex-col gap-3"><div className="text-xs text-muted-foreground"><p>คิวรอบนี้ {account.assignedSourceCount} กลุ่ม</p><p>ติดต่อครั้งล่าสุด {formatTime(account.lastSeenAt)}</p></div>{account.assignedSources?.length > 0 && <div className="flex flex-col gap-1 border-t pt-3">{account.assignedSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="truncate text-xs hover:underline">{source.name}</a>)}</div>}<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setLoginTarget(account); setLoginOpen(true); }}><LogIn data-icon="inline-start" />Login ใหม่</Button><Button variant="ghost" size="sm" onClick={async () => { await apiJson(`/api/social-feed/accounts?id=${account.id}`, { method: "DELETE" }); load(true); }}><Trash2 data-icon="inline-start" />ลบออก</Button></div></CardContent></Card>)}</div> : <Card><CardHeader><CardTitle>ยังไม่มีเครื่องอ่าน</CardTitle><CardDescription>เปิด Extension แล้วกด “เริ่มอ่าน” เครื่องจะเข้าคิวและรับกลุ่ม Facebook อัตโนมัติ</CardDescription></CardHeader></Card>}
          </TabsContent>
        </Tabs>
      </main>

      <TagDialog key={tagPost?.id || "closed"} post={tagPost} onOpenChange={(open) => !open && setTagPost(null)} onSave={(names) => updatePost(tagPost, { tags: names })} />
      <AlertDialog open={deleteAllOpen} onOpenChange={(open) => { if (!deletingAll) setDeleteAllOpen(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบโพสต์ทั้งหมด?</AlertDialogTitle><AlertDialogDescription>โพสต์ที่เก็บไว้ รวมถึงสถานะบันทึกและ Tag ที่ผูกกับโพสต์จะถูกลบทั้งหมด แต่กลุ่ม แท็ก บัญชี Bot และการตั้งค่าจะยังอยู่ โพสต์อาจถูกดึงกลับมาใหม่ในรอบถัดไป</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingAll}>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingAll} onClick={deleteAllPosts}><Trash2 data-icon="inline-start" />{deletingAll ? "กำลังลบ..." : "ยืนยันลบทั้งหมด"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(deleteSourceTarget)} onOpenChange={(open) => { if (!open && !deletingSources) setDeleteSourceTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleteSourceTarget?.all ? "ลบทุกหมวดหมู่และกลุ่ม Facebook?" : `ลบ ${deleteSourceTarget?.name || "กลุ่มนี้"}?`}</AlertDialogTitle><AlertDialogDescription>{deleteSourceTarget?.all ? "หมวดหมู่และกลุ่ม Facebook ทั้งหมด รวมถึงโพสต์ กฎ และสถานะตรวจสอบที่ผูกไว้จะถูกลบ แต่แท็กและบัญชี Bot จะยังอยู่" : "กลุ่มนี้ รวมถึงโพสต์และสถานะตรวจสอบที่ผูกไว้จะถูกลบออกจาก Feed Social"}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingSources}>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingSources} onClick={deleteSources}><Trash2 data-icon="inline-start" />{deletingSources ? "กำลังลบ..." : "ยืนยันลบ"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(deleteCategoryTarget)} onOpenChange={(open) => { if (!open && !deletingCategory) setDeleteCategoryTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบหมวดหมู่ {deleteCategoryTarget?.name}?</AlertDialogTitle><AlertDialogDescription>หมวดหมู่นี้ รวมถึงกลุ่ม Facebook โพสต์ และสถานะตรวจสอบทั้งหมดที่อยู่ภายในจะถูกลบถาวร</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingCategory}>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingCategory} onClick={deleteCategory}><Trash2 data-icon="inline-start" />{deletingCategory ? "กำลังลบ..." : "ยืนยันลบหมวดหมู่"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} onSaved={() => load(true)} />
      <SourceDialog key={`${sourceCategoryId || "all"}-${sourceOpen}`} open={sourceOpen} onOpenChange={setSourceOpen} categories={data.categories} initialCategoryId={sourceCategoryId} onSaved={() => load(true)} />
      <LoginDialog key={`${loginTarget?.id || "new"}-${loginOpen}`} open={loginOpen} account={loginTarget} onOpenChange={setLoginOpen} onConnect={connectLogin} />
    </div>
  );
}

function FeedPagination({ pagination, pageSize, onPageSizeChange, onPageChange }) {
  return <div className="my-3 flex flex-wrap items-center justify-center gap-3"><Select value={pageSize} onValueChange={onPageSizeChange}><SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="20">20 ต่อหน้า</SelectItem><SelectItem value="50">50 ต่อหน้า</SelectItem><SelectItem value="100">100 ต่อหน้า</SelectItem><SelectItem value="all">แสดงทั้งหมด</SelectItem></SelectGroup></SelectContent></Select>{pageSize === "all" ? <span className="text-sm text-muted-foreground">แสดงทั้งหมด {pagination.total} โพสต์</span> : <><Button variant="outline" size="sm" onClick={() => onPageChange((value) => Math.max(1, value - 1))} disabled={pagination.page <= 1}><ChevronLeft data-icon="inline-start" />ก่อนหน้า</Button><span className="text-sm tabular-nums text-muted-foreground">หน้า {pagination.page} / {pagination.totalPages}</span><Button variant="outline" size="sm" onClick={() => onPageChange((value) => Math.min(pagination.totalPages, value + 1))} disabled={pagination.page >= pagination.totalPages}>ถัดไป<ChevronRight data-icon="inline-end" /></Button></>}</div>;
}


function TagDialog({ post, onOpenChange, onSave }) {
  const [value, setValue] = useState(post?.tags?.map((item) => item.name).join(", ") || "");
  return <Dialog open={Boolean(post)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>ใส่ Tag ให้โพสต์</DialogTitle><DialogDescription>ใช้ Tag เพื่อรวมโพสต์ที่ต้องกลับมาดูด้วยกัน</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel>Tag</FieldLabel><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="ลูกค้าใหม่, ต้องตอบ" /><FieldDescription>คั่นหลาย Tag ด้วยเครื่องหมายจุลภาค</FieldDescription></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={() => { onSave(value.split(",")); onOpenChange(false); }}><Check data-icon="inline-start" />บันทึก Tag</Button></DialogFooter></DialogContent></Dialog>;
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
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>เพิ่มกลุ่ม Facebook</DialogTitle><DialogDescription>บัญชี Bot ที่ Login ไว้จะดึงโพสต์จากกลุ่มนี้อัตโนมัติ</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field><FieldLabel>หมวดหมู่</FieldLabel><Select value={categoryId || categories[0]?.id || ""} onValueChange={setCategoryId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>ชื่อกลุ่ม</FieldLabel><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="ชื่อที่ต้องการแสดง" /></Field><Field data-invalid={Boolean(error)}><FieldLabel>ลิงก์ Facebook Group</FieldLabel><Input type="url" value={facebookUrl} onChange={(event) => setFacebookUrl(event.target.value)} aria-invalid={Boolean(error)} placeholder="https://www.facebook.com/groups/123456789/" /><FieldDescription>รองรับทั้ง Group ID และ slug เช่น lineagew.th</FieldDescription></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={save} disabled={!categories.length || !name.trim() || !facebookUrl.trim()}><Check data-icon="inline-start" />เพิ่มกลุ่ม</Button></DialogFooter></DialogContent></Dialog>;
}

function LoginDialog({ open, account, onOpenChange, onConnect }) {
  const [label, setLabel] = useState(account?.label || "");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{account ? "Login บัญชี Bot ใหม่อีกครั้ง" : "เพิ่มบัญชี Bot"}</DialogTitle><DialogDescription>Login ครั้งเดียว ระบบเก็บ session ไว้ใน Chrome profile นี้ แล้ว Bot จะใช้บัญชีเดียวกันดึงโพสต์จากทุกกลุ่ม ไม่ต้องตั้งค่ารายกลุ่ม</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel>ชื่อเรียกบัญชี Bot</FieldLabel><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="เช่น FB-Bot-01" /></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button disabled={!label.trim()} onClick={() => { onConnect({ label: label.trim(), instanceId: account?.instanceId }); onOpenChange(false); }}><LogIn data-icon="inline-start" />เปิด Login</Button></DialogFooter></DialogContent></Dialog>;
}
