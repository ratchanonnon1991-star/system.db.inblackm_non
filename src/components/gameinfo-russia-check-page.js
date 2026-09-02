"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Clock3, ExternalLink, KeyRound, PackageCheck, PackageMinus, PackagePlus, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const FINISHED = new Set(["completed", "partial", "failed"]);
const STATUS_ITEMS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "unchanged", label: "ไม่มีการเปลี่ยนแปลง" },
  { value: "added", label: "เพิ่มใหม่" },
  { value: "removed", label: "หายไป" },
];
const STATUS_LABELS = { unchanged: "ไม่มีการเปลี่ยนแปลง", added: "เพิ่มใหม่", removed: "หายไป" };
const LOG_STATUS_ITEMS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "added", label: "เพิ่มใหม่" },
  { value: "removed", label: "หายไป" },
  { value: "restored", label: "กลับมา" },
];
const EVENT_LABELS = { added: "เพิ่มใหม่", removed: "หาย", restored: "กลับมา" };

function formatBangkok(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusBadge(status) {
  if (status === "added") return "success";
  if (status === "removed") return "destructive";
  return "secondary";
}

function displayStatus(item) {
  if (item.status === "removed") return "removed";
  if (item.activatedAt && (!item.lastScheduledAt || new Date(item.activatedAt) >= new Date(item.lastScheduledAt))) return "added";
  return "unchanged";
}

function displayStatusDate(item) {
  return item.displayStatus === "added" ? item.activatedAt || item.firstSeenAt : item.firstSeenAt;
}

function eventBadge(kind) {
  if (kind === "added" || kind === "restored") return "success";
  return "destructive";
}

async function pause(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default function GameinfoRussiaCheckPage({ initialDashboard, initialLogs, canRefresh, canManage, lang }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [logs, setLogs] = useState(initialLogs.events || []);
  const [nextCursor, setNextCursor] = useState(initialLogs.nextCursor || null);
  const [game, setGame] = useState("all");
  const [status, setStatus] = useState("all");
  const [logStatus, setLogStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [sessionDialog, setSessionDialog] = useState(false);
  const [sessionCookie, setSessionCookie] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState("");
  const [savingSession, setSavingSession] = useState(false);
  const loadRequest = useRef(0);

  const gameItems = useMemo(() => [
    { value: "all", label: "ทุกเกม" },
    ...(dashboard.games || []).map((item) => ({ value: String(item.gameId), label: item.gameName })),
  ], [dashboard.games]);
  const selectedGame = (dashboard.games || []).find((item) => String(item.gameId) === game);
  const demoSelected = Boolean(selectedGame?.isDemo);
  const selectedSourceDisabled = Boolean(selectedGame && !selectedGame.sourceEnabled && !selectedGame.isDemo);

  async function load(nextGame = game, nextLogStatus = logStatus) {
    const requestId = ++loadRequest.current;
    const dashboardQuery = new URLSearchParams();
    const logQuery = new URLSearchParams({ limit: "50" });
    if (nextGame !== "all") {
      dashboardQuery.set("gameId", nextGame);
      logQuery.set("gameId", nextGame);
    }
    if (nextLogStatus !== "all") logQuery.set("eventType", nextLogStatus);
    const [nextDashboard, nextLogs] = await Promise.all([
      apiJson(`/api/gameinfo/russia-check${dashboardQuery.size ? `?${dashboardQuery}` : ""}`, { fallbackError: "โหลดรายการ Pack ไม่สำเร็จ" }),
      apiJson(`/api/gameinfo/russia-check/logs?${logQuery}`, { fallbackError: "โหลด Log ไม่สำเร็จ" }),
    ]);
    if (requestId === loadRequest.current) {
      setDashboard(nextDashboard);
      setLogs(nextLogs.events || []);
      setNextCursor(nextLogs.nextCursor || null);
    }
  }

  async function changeGame(nextGame) {
    setLoading(true);
    setError("");
    try {
      await load(nextGame);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "โหลด Russia Check ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function selectGame(value) {
    setGame(value);
    changeGame(value);
  }

  async function selectLogStatus(value) {
    setLogStatus(value);
    setLoading(true);
    setError("");
    try {
      await load(game, value);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "โหลด Log ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRunning(true);
    setError("");
    try {
      const result = await apiJson("/api/gameinfo/russia-check/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game === "all" ? null : Number(game) }),
        fallbackError: "เริ่ม Russia Check ไม่สำเร็จ",
      });
      let run = result.run;
      for (let attempt = 0; attempt < 90 && !FINISHED.has(run.status); attempt += 1) {
        await pause(2000);
        run = (await apiJson(`/api/gameinfo/russia-check/runs/${run.id}`, { fallbackError: "โหลดสถานะ Russia Check ไม่สำเร็จ" })).run;
      }
      await load(game, logStatus);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Russia Check ไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "50", cursor: nextCursor });
      if (game !== "all") query.set("gameId", game);
      if (logStatus !== "all") query.set("eventType", logStatus);
      const data = await apiJson(`/api/gameinfo/russia-check/logs?${query}`, { fallbackError: "โหลด Log เพิ่มไม่สำเร็จ" });
      setLogs((current) => [...current, ...(data.events || [])]);
      setNextCursor(data.nextCursor || null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "โหลด Log เพิ่มไม่สำเร็จ");
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveSession(event) {
    event.preventDefault();
    if (!selectedGame?.sourceId) return;
    setSavingSession(true);
    setError("");
    try {
      await apiJson(`/api/gameinfo/russia-check/sources/${selectedGame.sourceId}/session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionCookie,
          expiresAt: sessionExpiresAt ? new Date(sessionExpiresAt).toISOString() : null,
        }),
        fallbackError: "บันทึก session ไม่สำเร็จ",
      });
      setSessionCookie("");
      setSessionExpiresAt("");
      setSessionDialog(false);
      await load(game, logStatus);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "บันทึก session ไม่สำเร็จ");
    } finally {
      setSavingSession(false);
    }
  }

  async function disconnectSession() {
    if (!selectedGame?.sourceId || !window.confirm("ลบ session ที่เก็บไว้สำหรับเกมนี้หรือไม่?")) return;
    setSavingSession(true);
    setError("");
    try {
      await apiJson(`/api/gameinfo/russia-check/sources/${selectedGame.sourceId}/session`, {
        method: "DELETE",
        fallbackError: "ลบ session ไม่สำเร็จ",
      });
      setSessionDialog(false);
      await load(game, logStatus);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ลบ session ไม่สำเร็จ");
    } finally {
      setSavingSession(false);
    }
  }

  const latest = dashboard.latestRun;
  const latestChanges = (latest?.addedCount || 0) + (latest?.removedCount || 0) + (latest?.restoredCount || 0);
  const packItems = useMemo(() => (dashboard.items || [])
    .map((item) => ({ ...item, displayStatus: displayStatus(item) }))
    .filter((item) => status === "all" || item.displayStatus === status), [dashboard.items, status]);
  const groups = useMemo(() => {
    const byGame = new Map();
    for (const event of logs) {
      const key = String(event.gameId);
      if (!byGame.has(key)) byGame.set(key, { gameId: event.gameId, gameName: event.gameName, events: [] });
      byGame.get(key).events.push(event);
    }
    return [...byGame.values()];
  }, [logs]);
  const configErrors = (dashboard.games || []).filter((item) => item.configError);

  return (
    <div data-shadcn-focus className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href={`/gameinfo/${lang}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}><ArrowLeft data-icon="inline-start" />กลับ GameInfo</Link>
          <p className="text-xs font-medium text-muted-foreground">GAMEINFO · PACK AVAILABILITY</p>
          <h1 className="text-2xl font-semibold tracking-tight">Russia Check</h1>
          <p className="text-sm text-muted-foreground">ติดตามแพ็กที่เพิ่ม หาย และกลับมาใน Xsolla ประเทศรัสเซีย</p>
        </div>
        <Button onClick={refresh} disabled={!canRefresh || running || demoSelected || selectedSourceDisabled} title={demoSelected ? "demo data เป็นข้อมูลตัวอย่างแบบอ่านอย่างเดียว" : selectedSourceDisabled ? "Source นี้ยังไม่เปิดดึงข้อมูลอัตโนมัติ" : canRefresh ? "ดึงข้อมูลตามเกมที่เลือก" : "ต้องมีสิทธิ์ Market Check"}>
          {running ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          {running ? "กำลังตรวจ…" : "รีข้อมูล"}
        </Button>
      </header>

      {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {configErrors.length ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Source ผูกกับเกมไม่ถูกต้อง</AlertTitle><AlertDescription>{configErrors.map((item) => `Game ID ${item.gameId} ต้องเป็น ${item.expectedGameName}`).join(", ")}</AlertDescription></Alert> : null}
      {selectedGame?.authRequired && (!selectedGame.authConfigured || selectedGame.authExpired) ? <Alert><KeyRound /><AlertTitle>{selectedGame.authExpired ? "Session หมดอายุ" : "ยังไม่ได้เชื่อมบัญชี"}</AlertTitle><AlertDescription>ระบบจะไม่ดึงหรือเปลี่ยนสถานะ Pack จนกว่าจะบันทึก session ที่ใช้งานได้</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>สถานะการตรวจ</CardTitle>
          <CardDescription>อัตโนมัติทุกวัน 09:00 น. เวลาไทย</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">รอบล่าสุด</p><p className="font-medium">{latest ? formatBangkok(latest.finishedAt || latest.createdAt) : "ยังไม่เคยตรวจ"}</p></div>
          <div><p className="text-xs text-muted-foreground">ผลล่าสุด</p><p className="font-medium">{latest?.status === "failed" ? "ตรวจไม่สำเร็จ" : latestChanges ? `เปลี่ยนแปลง ${latestChanges} รายการ` : "ไม่มีการเปลี่ยนแปลง"}</p></div>
          <div><p className="text-xs text-muted-foreground">รอบถัดไป</p><p className="font-medium">{formatBangkok(dashboard.nextRunAt)}</p></div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Select items={gameItems} value={game} onValueChange={selectGame}>
          <SelectTrigger aria-label="เลือกเกม"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{gameItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        {selectedGame?.storeUrl ? <a href={selectedGame.storeUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><ExternalLink data-icon="inline-start" />เปิดหน้าเว็บ</a> : null}
        {selectedGame?.authRequired ? <Badge variant={selectedGame.authConfigured && !selectedGame.authExpired ? "success" : "secondary"}>{selectedGame.authConfigured && !selectedGame.authExpired ? <ShieldCheck data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}{selectedGame.authConfigured && !selectedGame.authExpired ? "เชื่อมบัญชีแล้ว" : "ต้องเชื่อมบัญชี"}</Badge> : null}
        {selectedGame?.authRequired && canManage ? <Button variant="outline" onClick={() => setSessionDialog(true)}><KeyRound data-icon="inline-start" />จัดการ Login</Button> : null}
      </div>

      <Tabs defaultValue="packs">
        <TabsList><TabsTrigger value="packs"><PackageCheck data-icon="inline-start" />แพ็กปัจจุบัน</TabsTrigger><TabsTrigger value="logs"><Clock3 data-icon="inline-start" />Log</TabsTrigger></TabsList>
        <TabsContent value="packs" className="flex flex-col gap-4 pt-2">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="มีอยู่" value={dashboard.summary.active} icon={PackageCheck} />
            <SummaryCard title="เพิ่มรอบล่าสุด" value={latest?.addedCount || 0} icon={PackagePlus} />
            <SummaryCard title="รอยืนยันหาย" value={dashboard.summary.pending} icon={Clock3} />
            <SummaryCard title="หายแล้ว" value={dashboard.summary.removed} icon={PackageMinus} />
          </div>
          <Select items={STATUS_ITEMS} value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="กรองสถานะ Pack"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{STATUS_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {loading ? <LoadingTable /> : packItems.length ? <PackTable items={packItems} /> : <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageCheck /></EmptyMedia><EmptyTitle>ยังไม่มี Pack</EmptyTitle><EmptyDescription>กดรีข้อมูลเพื่อสร้างข้อมูลตั้งต้น หรือเปลี่ยนตัวกรอง</EmptyDescription></EmptyHeader></Empty>}
        </TabsContent>
        <TabsContent value="logs" className="flex flex-col gap-4 pt-2">
          <Select items={LOG_STATUS_ITEMS} value={logStatus} onValueChange={selectLogStatus}>
            <SelectTrigger aria-label="กรองสถานะ Log"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{LOG_STATUS_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {loading ? <LoadingLog /> : groups.length ? groups.map((group) => <LogGroup key={group.gameId} group={group} />) : <Empty><EmptyHeader><EmptyMedia variant="icon"><Clock3 /></EmptyMedia><EmptyTitle>ยังไม่มี Log ตามสถานะนี้</EmptyTitle><EmptyDescription>ลองเลือกสถานะอื่น กดรีข้อมูล หรือรอรอบอัตโนมัติ</EmptyDescription></EmptyHeader></Empty>}
          {!loading && nextCursor ? <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="self-center">{loadingMore ? <Spinner data-icon="inline-start" /> : null}โหลดเพิ่มเติม</Button> : null}
        </TabsContent>
      </Tabs>

      <Dialog open={sessionDialog} onOpenChange={setSessionDialog}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={saveSession} className="contents">
            <DialogHeader>
              <DialogTitle>เชื่อมบัญชี {selectedGame?.gameName}</DialogTitle>
              <DialogDescription>วางค่า Cookie จาก request หลังล็อกอิน ระบบจะเข้ารหัสและเก็บไว้ฝั่งเซิร์ฟเวอร์เท่านั้น ผู้ใช้ทั่วไปจะไม่เห็นค่านี้</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="russia-check-session-cookie">Cookie</FieldLabel>
                <Textarea id="russia-check-session-cookie" value={sessionCookie} onChange={(event) => setSessionCookie(event.target.value)} placeholder="cookie_name=value; another_cookie=value" autoComplete="off" rows={5} required aria-describedby="russia-check-session-help" />
                <FieldDescription id="russia-check-session-help">ใส่เฉพาะค่าใน Request Header ชื่อ Cookie และอย่าส่งรหัสผ่านบัญชี</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="russia-check-session-expiry">วันหมดอายุ (ถ้าทราบ)</FieldLabel>
                <Input id="russia-check-session-expiry" type="datetime-local" value={sessionExpiresAt} onChange={(event) => setSessionExpiresAt(event.target.value)} />
                <FieldDescription>เว้นว่างได้ ระบบจะแสดงว่าเชื่อมอยู่จนกว่าการดึงข้อมูลจะตอบว่า session ใช้ไม่ได้</FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              {selectedGame?.authConfigured ? <Button type="button" variant="destructive" onClick={disconnectSession} disabled={savingSession}>ลบ Session</Button> : null}
              <Button type="button" variant="outline" onClick={() => setSessionDialog(false)} disabled={savingSession}>ยกเลิก</Button>
              <Button type="submit" disabled={savingSession || !sessionCookie.trim()}>{savingSession ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}{savingSession ? "กำลังบันทึก…" : "บันทึก Session"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }) {
  return <Card size="sm"><CardHeader><CardDescription>{title}</CardDescription><CardTitle className="flex items-center justify-between"><span className="text-2xl tabular-nums">{value}</span><Icon className="text-muted-foreground" /></CardTitle></CardHeader></Card>;
}

function PackTable({ items }) {
  return <Card><CardHeader><CardTitle>รายการ Pack</CardTitle><CardDescription>{items.length} รายการตามตัวกรองปัจจุบัน</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>เกม</TableHead><TableHead>ชื่อ Pack</TableHead><TableHead>สถานะ</TableHead><TableHead>วันที่เริ่มพบ/เพิ่ม</TableHead><TableHead>วันที่หาย</TableHead></TableRow></TableHeader><TableBody>{items.map((item, index) => <TableRow key={`${item.gameId}:${item.name}:${index}`}><TableCell>{item.gameName}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell><Badge variant={statusBadge(item.displayStatus)}>{STATUS_LABELS[item.displayStatus]}</Badge></TableCell><TableCell>{formatBangkok(displayStatusDate(item))}</TableCell><TableCell>{formatBangkok(item.removedAt)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>;
}

function LogGroup({ group }) {
  return <Card><CardHeader><CardTitle>{group.gameName}</CardTitle><CardDescription>{group.events.length} เหตุการณ์ที่โหลดแล้ว</CardDescription></CardHeader><CardContent><ol className="flex flex-col gap-3">{group.events.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="flex items-center gap-2"><Badge variant={eventBadge(event.eventType)}>{event.eventType === "restored" ? <RotateCcw data-icon="inline-start" /> : event.eventType === "removed" ? <PackageMinus data-icon="inline-start" /> : <PackagePlus data-icon="inline-start" />}{EVENT_LABELS[event.eventType]}</Badge><span className="font-medium">{event.packName}</span></div><time className="text-xs text-muted-foreground">{formatBangkok(event.createdAt)}</time></li>)}</ol></CardContent></Card>;
}

function LoadingTable() {
  return <Card><CardHeader><CardTitle>กำลังโหลดรายการ Pack</CardTitle><CardDescription>กำลังอ่านข้อมูลตามตัวกรอง</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</CardContent></Card>;
}

function LoadingLog() {
  return <Card><CardHeader><CardTitle>กำลังโหลด Log</CardTitle><CardDescription>กำลังอ่านเหตุการณ์ตามสถานะ</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-12 w-full" />)}</CardContent></Card>;
}
