"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Bookmark, BookmarkCheck, Check, CircleDot, Clock3, Download, ExternalLink,
  Filter, FolderPlus, Hash, LayoutGrid, LogIn, Plus, Radio, RefreshCw, Search, Tags, Trash2, UserRound,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

const EMPTY = { categories: [], sources: [], rules: [], tags: [], posts: [], accounts: [] };

function formatTime(value) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function RuleBadge({ mode }) {
  const label = mode === "all" ? "ALL" : mode === "exclude" ? "ไม่เอา" : "+ ANY";
  return <Badge variant={mode === "all" ? "default" : "outline"}>{label}</Badge>;
}

const ACCESS_LABELS = { ready: "พร้อมใช้งาน", logged_out: "Session หลุด", needs_join: "ยังไม่เข้ากลุ่ม", checkpoint: "ต้องยืนยันตัวตน", error: "ตรวจไม่สำเร็จ", unknown: "ไม่ทราบสถานะ", unchecked: "ยังไม่ตรวจ" };
const ACCOUNT_LABELS = { ...ACCESS_LABELS, offline: "Extension ออฟไลน์" };

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
  const [tab, setTab] = useState("feed");
  const [ruleOpen, setRuleOpen] = useState(false);
  const [tagPost, setTagPost] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [accountSource, setAccountSource] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState(null);
  const [checkingSessions, setCheckingSessions] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (tag !== "all") params.set("tag", tag);
    if (savedOnly) params.set("saved", "true");
    if (query) params.set("q", query);
    try {
      const result = await apiJson(`/api/social-feed?${params}`, { fallbackError: "โหลด Social Feed ไม่สำเร็จ" });
      setData(result); setError("");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [category, tag, savedOnly, query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- filter changes intentionally start a server refresh
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => load(true), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const sourcesByCategory = useMemo(() => data.categories.map((item) => ({
    ...item, sources: data.sources.filter((source) => source.categoryId === item.id),
  })), [data.categories, data.sources]);

  const updatePost = async (post, body) => {
    try {
      await apiJson(`/api/social-feed/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), fallbackError: "อัปเดตโพสต์ไม่สำเร็จ" });
      await load(true);
    } catch (err) { setError(err.message); }
  };

  const openTag = (selectedTag) => { setTag(selectedTag); setTab("feed"); };
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
            <Badge variant="outline"><CircleDot data-icon="inline-start" /> อัปเดตทุก 10 วินาที</Badge>
            <Button variant="outline" size="icon" onClick={() => load()} disabled={refreshing} aria-label="รีเฟรช"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
            <Button variant="outline" size="icon" render={<Link href="/" />} aria-label="กลับเมนู"><LayoutGrid /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <section className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">จับข้อความที่ต้องใช้<br />ก่อนโพสต์จะไหลผ่านไป</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">รวมโพสต์จาก {data.sources.length || 13} กลุ่ม แยกตามเกมและคัดด้วย rule ที่บันทึกไว้ โดยเก็บเฉพาะข้อความกับลิงก์ต้นโพสต์</p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div><p className="text-2xl font-semibold tabular-nums">{data.posts.length}</p><p className="text-muted-foreground">โพสต์ที่ตรง rule</p></div>
            <div><p className="text-2xl font-semibold tabular-nums">{data.rules.length}</p><p className="text-muted-foreground">rules ที่เปิดใช้</p></div>
          </div>
        </section>

        {error && <Alert variant="destructive"><AlertTitle>โหลดข้อมูลไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="line">
            <TabsTrigger value="feed"><Radio data-icon="inline-start" />ฟีด</TabsTrigger>
            <TabsTrigger value="tags"><Tags data-icon="inline-start" />ดูตาม Tag</TabsTrigger>
            <TabsTrigger value="sources"><ExternalLink data-icon="inline-start" />แหล่งข้อมูล</TabsTrigger>
            <TabsTrigger value="accounts"><UserRound data-icon="inline-start" />บัญชี Login</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="pt-4">
            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="flex flex-col gap-4">
                <Card size="sm">
                  <CardHeader><CardTitle>กรองฟีด</CardTitle><CardDescription>เลือกเงื่อนไขที่ต้องการดู</CardDescription></CardHeader>
                  <CardContent><FieldGroup>
                    <Field><FieldLabel>ค้นหาข้อความ</FieldLabel><div className="flex gap-2"><Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuery(search.trim())} placeholder="เช่น เติมเกม" /><Button size="icon" onClick={() => setQuery(search.trim())} aria-label="ค้นหา"><Search /></Button></div></Field>
                    <Field><FieldLabel>หมวดหมู่</FieldLabel><Select value={category} onValueChange={setCategory}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">ทุกหมวดหมู่</SelectItem>{data.categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                    <Field><FieldLabel>Tag</FieldLabel><Select value={tag} onValueChange={setTag}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">ทุก Tag</SelectItem>{data.tags.map((item) => <SelectItem key={item.id} value={item.id}>#{item.name} ({item.count})</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                    <Field orientation="horizontal"><Checkbox checked={savedOnly} onCheckedChange={setSavedOnly} id="saved-only" /><FieldLabel htmlFor="saved-only">เฉพาะโพสต์ที่บันทึก</FieldLabel></Field>
                  </FieldGroup></CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader><CardTitle>Rules</CardTitle><CardDescription>หลาย rule ใช้แบบ “หรือ” ต่อกัน</CardDescription><CardAction><Button size="icon-sm" onClick={() => setRuleOpen(true)} aria-label="เพิ่ม rule"><Plus /></Button></CardAction></CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {data.rules.map((rule) => <div key={rule.id} className="flex items-start gap-2 border-b pb-3 last:border-0 last:pb-0"><RuleBadge mode={rule.mode} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{rule.name}</p><p className="mt-1 text-xs text-muted-foreground">{rule.terms.join(" · ")}</p></div><Button variant="ghost" size="icon-xs" aria-label="ลบ rule" onClick={async () => { await apiJson(`/api/social-feed/rules?id=${rule.id}`, { method: "DELETE" }); load(true); }}><Trash2 /></Button></div>)}
                  </CardContent>
                </Card>
              </aside>

              <section className="min-w-0">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm text-muted-foreground"><Filter className="mr-1 inline size-4" />พบ {data.posts.length} โพสต์</p>{data.refreshedAt && <p className="text-xs text-muted-foreground">ล่าสุด {formatTime(data.refreshedAt)}</p>}</div>
                {loading ? <div className="flex flex-col gap-3">{[1,2,3].map((item) => <Skeleton key={item} className="h-40 w-full" />)}</div> : data.posts.length === 0 ? <Card><CardHeader><CardTitle>ยังไม่มีโพสต์ที่ตรงเงื่อนไข</CardTitle><CardDescription>ลองเปลี่ยนหมวดหมู่, Tag หรือ rule แล้วรอรอบอัปเดตถัดไป</CardDescription></CardHeader></Card> : <div className="flex flex-col gap-3">
                  {data.posts.map((post) => <article key={post.id} className="group rounded-xl border bg-card p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{post.sourceName}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 />{formatTime(post.postedAt)}</p></div><Button variant="ghost" size="icon" aria-label={post.saved ? "ยกเลิกบันทึก" : "บันทึกโพสต์"} onClick={() => updatePost(post, { saved: !post.saved })}>{post.saved ? <BookmarkCheck /> : <Bookmark />}</Button></div>
                    <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7">{post.message}</p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div className="flex flex-wrap gap-1.5">{post.tags.map((item) => <Button key={item.id} variant="outline" size="xs" onClick={() => openTag(item.id)}>#{item.name}</Button>)}<Button variant="ghost" size="xs" onClick={() => setTagPost(post)}><Hash data-icon="inline-start" />ใส่ Tag</Button></div><Button variant="link" size="sm" render={<a href={post.originalUrl} target="_blank" rel="noreferrer" />}>เปิดต้นโพสต์<ArrowUpRight data-icon="inline-end" /></Button></div>
                  </article>)}
                </div>}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="tags" className="pt-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.tags.length ? data.tags.map((item) => <Card key={item.id} size="sm" className="cursor-pointer" onClick={() => openTag(item.id)}><CardHeader><CardTitle>#{item.name}</CardTitle><CardDescription>{item.count} โพสต์</CardDescription><CardAction><ArrowUpRight /></CardAction></CardHeader></Card>) : <p className="text-sm text-muted-foreground">ยังไม่มี Tag — เพิ่มได้จากปุ่ม “ใส่ Tag” ใต้โพสต์</p>}</div></TabsContent>

          <TabsContent value="sources" className="pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">หมวดหมู่และกลุ่มที่ติดตาม</p><p className="text-sm text-muted-foreground">เพิ่มกลุ่มใหม่แล้วใช้ Group ID เดียวกันกับ collector</p></div>
              <div className="flex flex-wrap gap-2"><Button variant="outline" render={<a href="/social-feed-collector.zip" download />}><Download data-icon="inline-start" />ดาวน์โหลด Extension</Button><Button variant="outline" onClick={() => setCategoryOpen(true)}><FolderPlus data-icon="inline-start" />เพิ่มหมวดหมู่</Button><Button onClick={() => setSourceOpen(true)}><Plus data-icon="inline-start" />เพิ่มกลุ่ม</Button></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">{sourcesByCategory.map((group) => <Card key={group.id}><CardHeader><CardTitle>{group.name}</CardTitle><CardDescription>{group.sources.length} กลุ่ม Facebook</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{group.sources.map((source) => <div key={source.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm"><a href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 font-medium hover:underline"><span>{source.name}</span><ExternalLink className="mt-0.5 shrink-0" /></a><div className="flex flex-wrap items-center gap-2"><Badge variant={source.accessStatus === "ready" ? "default" : "outline"}>{ACCESS_LABELS[source.accessStatus] || ACCESS_LABELS.unknown}</Badge>{source.requiresLogin && <Badge variant="secondary">ต้อง Login</Badge>}</div><div><Button variant="ghost" size="xs" onClick={() => setAccountSource(source)}>ตั้งค่ากลุ่ม</Button></div>{source.sessionCheckedAt && <span className="text-xs text-muted-foreground">ตรวจล่าสุด {formatTime(source.sessionCheckedAt)}</span>}</div>)}</CardContent></Card>)}</div>
          </TabsContent>

          <TabsContent value="accounts" className="pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Account Pool</p><p className="text-sm text-muted-foreground">หนึ่ง Chrome profile ต่อหนึ่ง Facebook login ระบบแบ่งกลุ่มให้บัญชีที่พร้อมอัตโนมัติ</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={checkSessions} disabled={checkingSessions}><RefreshCw data-icon="inline-start" className={checkingSessions ? "animate-spin" : ""} />{checkingSessions ? "กำลังเช็ค..." : "เช็ค Profile นี้"}</Button><Button onClick={() => { setLoginTarget(null); setLoginOpen(true); }}><Plus data-icon="inline-start" />เพิ่ม Login</Button></div></div>
            {data.accounts.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map((account) => <Card key={account.id}><CardHeader><CardTitle className="flex items-center gap-2"><UserRound />{account.label}</CardTitle><CardDescription>{account.platformAccountId ? `Facebook ID ${account.platformAccountId}` : "ยังไม่พบบัญชี Facebook"}</CardDescription><CardAction><Badge variant={account.status === "ready" ? "default" : "outline"}>{ACCOUNT_LABELS[account.status] || ACCOUNT_LABELS.unknown}</Badge></CardAction></CardHeader><CardContent className="flex flex-col gap-3"><div className="text-xs text-muted-foreground"><p>ตรวจแล้ว {account.checkedSources} กลุ่ม</p><p>ติดต่อ Extension ล่าสุด {formatTime(account.lastSeenAt)}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setLoginTarget(account); setLoginOpen(true); }}><LogIn data-icon="inline-start" />Login ใหม่</Button><Button variant="ghost" size="sm" onClick={async () => { await apiJson(`/api/social-feed/accounts?id=${account.id}`, { method: "DELETE" }); load(true); }}><Trash2 data-icon="inline-start" />ลบออก</Button></div></CardContent></Card>)}</div> : <Card><CardHeader><CardTitle>ยังไม่มีบัญชี Login</CardTitle><CardDescription>เปิดหน้านี้จาก Chrome profile ที่ต้องการใช้ แล้วกด “เพิ่ม Login”</CardDescription></CardHeader></Card>}
          </TabsContent>
        </Tabs>
      </main>

      <RuleDialog open={ruleOpen} onOpenChange={setRuleOpen} categories={data.categories} onSaved={() => load(true)} />
      <TagDialog key={tagPost?.id || "closed"} post={tagPost} onOpenChange={(open) => !open && setTagPost(null)} onSave={(names) => updatePost(tagPost, { tags: names })} />
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} onSaved={() => load(true)} />
      <SourceDialog open={sourceOpen} onOpenChange={setSourceOpen} categories={data.categories} onSaved={() => load(true)} />
      <AccountDialog key={accountSource?.id || "account-closed"} source={accountSource} onOpenChange={(open) => !open && setAccountSource(null)} onSaved={() => load(true)} />
      <LoginDialog key={`${loginTarget?.id || "new"}-${loginOpen}`} open={loginOpen} account={loginTarget} onOpenChange={setLoginOpen} onConnect={connectLogin} />
    </div>
  );
}

function RuleDialog({ open, onOpenChange, categories, onSaved }) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState("all");
  const [terms, setTerms] = useState("");
  const save = async () => {
    await apiJson("/api/social-feed/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: categoryId || categories[0]?.id, name, mode, terms }), fallbackError: "บันทึก rule ไม่สำเร็จ" });
    setName(""); setTerms(""); onOpenChange(false); onSaved();
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>เพิ่ม Filter Rule</DialogTitle><DialogDescription>ALL ต้องเจอครบทุกคำ, + ANY เจอคำใดคำหนึ่งก็รับโพสต์, ไม่เอาใช้ตัดโพสต์ออก</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel>หมวดหมู่</FieldLabel><Select value={categoryId || categories[0]?.id || ""} onValueChange={setCategoryId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>ชื่อ Rule</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น มีทั้งคำว่า เติม และ เกม" /></Field><Field><FieldLabel>รูปแบบ</FieldLabel><Select value={mode} onValueChange={setMode}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">ALL — ต้องมีครบทุกคำ</SelectItem><SelectItem value="any">+ ANY — เจอคำไหนก็รับ</SelectItem><SelectItem value="exclude">ไม่เอา — เจอแล้วตัดออก</SelectItem></SelectGroup></SelectContent></Select></Field><Field><FieldLabel>คำที่ต้องการ</FieldLabel><Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="เติม, เกม" /><FieldDescription>คั่นหลายคำด้วยเครื่องหมายจุลภาค</FieldDescription></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={save} disabled={!name.trim() || !terms.trim()}><Check data-icon="inline-start" />บันทึก Rule</Button></DialogFooter></DialogContent></Dialog>;
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

function SourceDialog({ open, onOpenChange, categories, onSaved }) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await apiJson("/api/social-feed/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: categoryId || categories[0]?.id, name, facebookUrl, requiresLogin }), fallbackError: "เพิ่มกลุ่ม Facebook ไม่สำเร็จ" });
      setName(""); setFacebookUrl(""); setRequiresLogin(false); setError(""); onOpenChange(false); onSaved();
    } catch (err) { setError(err.message); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>เพิ่มกลุ่ม Facebook</DialogTitle><DialogDescription>กลุ่มจะปรากฏใต้หมวดหมู่ที่เลือก และพร้อมรับโพสต์จาก collector</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field><FieldLabel>หมวดหมู่</FieldLabel><Select value={categoryId || categories[0]?.id || ""} onValueChange={setCategoryId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>ชื่อกลุ่ม</FieldLabel><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="ชื่อที่ต้องการแสดง" /></Field><Field data-invalid={Boolean(error)}><FieldLabel>ลิงก์ Facebook Group</FieldLabel><Input type="url" value={facebookUrl} onChange={(event) => setFacebookUrl(event.target.value)} aria-invalid={Boolean(error)} placeholder="https://www.facebook.com/groups/123456789/" /><FieldDescription>รองรับทั้ง Group ID และ slug เช่น lineagew.th</FieldDescription></Field><Field orientation="horizontal"><Checkbox checked={requiresLogin} onCheckedChange={setRequiresLogin} id="source-requires-login" /><FieldLabel htmlFor="source-requires-login">ต้อง Login หรือเข้าร่วมกลุ่มก่อนจึงเห็นโพสต์</FieldLabel></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={save} disabled={!categories.length || !name.trim() || !facebookUrl.trim()}><Check data-icon="inline-start" />เพิ่มกลุ่ม</Button></DialogFooter></DialogContent></Dialog>;
}

function AccountDialog({ source, onOpenChange, onSaved }) {
  const [requiresLogin, setRequiresLogin] = useState(Boolean(source?.requiresLogin));
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await apiJson("/api/social-feed/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: source.id, requiresLogin }), fallbackError: "ตั้งค่ากลุ่มไม่สำเร็จ" });
      onOpenChange(false); onSaved();
    } catch (err) { setError(err.message); }
  };
  return <Dialog open={Boolean(source)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>ตั้งค่ากลุ่ม</DialogTitle><DialogDescription>{source?.name}</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field orientation="horizontal"><Checkbox checked={requiresLogin} onCheckedChange={setRequiresLogin} id="edit-requires-login" /><FieldLabel htmlFor="edit-requires-login">กลุ่มนี้ต้องใช้ Login หรือเข้าร่วมก่อน</FieldLabel></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={save}><Check data-icon="inline-start" />บันทึก</Button></DialogFooter></DialogContent></Dialog>;
}

function LoginDialog({ open, account, onOpenChange, onConnect }) {
  const [label, setLabel] = useState(account?.label || "");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{account ? "Login บัญชีใหม่อีกครั้ง" : "เพิ่ม Facebook Login"}</DialogTitle><DialogDescription>เปิดจาก Chrome profile ของบัญชีนี้ ระบบจะเก็บ session ไว้ใน profile และส่งเฉพาะ Facebook ID กับสถานะกลับมา</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel>ชื่อเรียกบัญชี</FieldLabel><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="เช่น FB-Admin-01" /></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button disabled={!label.trim()} onClick={() => { onConnect({ label: label.trim(), instanceId: account?.instanceId }); onOpenChange(false); }}><LogIn data-icon="inline-start" />เปิด Login</Button></DialogFooter></DialogContent></Dialog>;
}
