"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Clock3, Copy, Download, ExternalLink, KeyRound, LogIn, PackageCheck, PackageMinus, PackagePlus, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import GameinfoRussiaCheckBrowserConnect from "@/components/gameinfo-russia-check-browser-connect";
import { apiJson } from "@/lib/api-json";
import { russiaCheckDisplayStatus } from "@/lib/gameinfo-russia-check-recency";
import { refreshWithLogin, loginRequiredGames } from "@/lib/gameinfo-russia-check-refresh";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatBangkok(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusBadge(status) {
  if (status === "added") return "success";
  if (status === "removed") return "destructive";
  return "secondary";
}

function latestMovementAt(item) {
  // Refreshes and the 24-hour "new" badge expiry are not pack movements.
  return item.status === "removed" ? item.removedAt : item.activatedAt || item.firstSeenAt;
}

function eventBadge(kind) {
  if (kind === "added" || kind === "restored") return "success";
  return "destructive";
}

export default function GameinfoRussiaCheckPage({ initialDashboard, initialLogs, initialGameId = null, canRefresh, canManage, lang }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [logs, setLogs] = useState(initialLogs.events || []);
  const [nextCursor, setNextCursor] = useState(initialLogs.nextCursor || null);
  const [game, setGame] = useState(initialGameId == null ? "all" : String(initialGameId));
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [logStatus, setLogStatus] = useState("all");
  const [logDate, setLogDate] = useState(initialGameId == null ? "" : bangkokToday());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [sessionDialog, setSessionDialog] = useState(false);
  const [sessionCookie, setSessionCookie] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState("");
  const [savingSession, setSavingSession] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const [connectingBrowser, setConnectingBrowser] = useState(false);
  const [manualLogin, setManualLogin] = useState(false);
  const [loginRequest, setLoginRequest] = useState(null);
  const [refreshProgress, setRefreshProgress] = useState("");
  const [refreshResult, setRefreshResult] = useState(null);
  const loginCompletion = useRef(null);
  const refreshActive = useRef(false);
  const loadRequest = useRef(0);
  useEffect(() => () => { loginCompletion.current?.reject(Error("ยกเลิกการรีข้อมูล")); loginCompletion.current = null; }, []);

  // Re-read stored data only; never start provider checks or login from this timer.
  useEffect(() => {
    if (loading || running) return;
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      const requestId = loadRequest.current;
      try {
        const query = game === "all" ? "" : `?gameId=${encodeURIComponent(game)}`;
        const nextDashboard = await apiJson(`/api/gameinfo/russia-check${query}`, { fallbackError: "โหลดสถานะไม่สำเร็จ" });
        if (!cancelled && requestId === loadRequest.current) setDashboard(nextDashboard);
      } catch {
        // Preserve the last successful snapshot and its displayed time; retry next minute.
      } finally {
        inFlight = false;
      }
    }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [game, loading, running]);

  const gameItems = useMemo(() => [
    { value: "all", label: "ทุกเกม" },
    ...(dashboard.games || []).map((item) => ({ value: String(item.gameId), label: item.gameName })),
  ], [dashboard.games]);
  const selectedGame = (dashboard.games || []).find((item) => String(item.gameId) === game);
  const demoSelected = Boolean(selectedGame?.isDemo);
  const selectedSourceDisabled = Boolean(selectedGame && !selectedGame.sourceEnabled && !selectedGame.isDemo);
  const refreshBlockedReason = selectedGame?.refreshBlockedReason || (selectedSourceDisabled ? "Source นี้ยังไม่เปิดดึงข้อมูลอัตโนมัติ" : "");
  const unavailableGames = (dashboard.games || []).filter((item) => !item.isDemo && item.refreshBlockedReason);
  const isInfold = selectedGame?.provider === "infold";
  const isInfinityNikki = selectedGame?.connectorProvider === "infinity-nikki";
  const hasBrowserLogin = ["infold", "gryphline"].includes(selectedGame?.provider);
  const canReconnect = canManage && loginRequiredGames(dashboard.games, game === "all" ? null : game).some((item) => item.sourceId === selectedGame?.sourceId);
  const authLabel = selectedGame?.authState === "verified" ? "เชื่อมบัญชีแล้ว · ตรวจสอบผ่าน" : selectedGame?.authState === "invalid" ? "ต้อง Login ใหม่" : selectedGame?.authExpired ? "Session หมดอายุ" : selectedGame?.authConfigured ? "บันทึก Session แล้ว · ยังไม่ตรวจสอบ" : "ยังไม่มี Session";

  function changeSessionDialog(open) {
    if (savingSession || connectingBrowser) return;
    setSessionDialog(open);
    if (!open) {
      setSessionCookie("");
      setSessionExpiresAt("");
      setManualLogin(false);
    }
  }

  async function load(nextGame = game, nextLogStatus = logStatus, nextLogDate = logDate) {
    const requestId = ++loadRequest.current;
    const dashboardQuery = new URLSearchParams();
    const logQuery = new URLSearchParams({ limit: "50" });
    if (nextGame !== "all") {
      dashboardQuery.set("gameId", nextGame);
      logQuery.set("gameId", nextGame);
    }
    if (nextLogStatus !== "all") logQuery.set("eventType", nextLogStatus);
    if (nextGame !== "all" && nextLogDate) logQuery.set("date", nextLogDate);
    const [nextDashboard, nextLogs] = await Promise.all([
      apiJson(`/api/gameinfo/russia-check${dashboardQuery.size ? `?${dashboardQuery}` : ""}`, { fallbackError: "โหลดรายการ Pack ไม่สำเร็จ" }),
      apiJson(`/api/gameinfo/russia-check/logs?${logQuery}`, { fallbackError: "โหลด Log ไม่สำเร็จ" }),
    ]);
    if (requestId === loadRequest.current) {
      setDashboard(nextDashboard);
      setLogs(nextLogs.events || []);
      setNextCursor(nextLogs.nextCursor || null);
    }
    return nextDashboard;
  }

  async function changeGame(nextGame) {
    setSessionNotice("");
    setLoading(true);
    setError("");
    try {
      const nextDate = nextGame === "all" ? "" : bangkokToday();
      setLogDate(nextDate);
      await load(nextGame, logStatus, nextDate);
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

  async function selectLogDate(event) {
    const value = event.target.value;
    setLogDate(value);
    setLoading(true);
    setError("");
    try {
      await load(game, logStatus, value);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "โหลด Log ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (refreshActive.current) return;
    refreshActive.current = true;
    setRunning(true);
    setError("");
    try {
      const run = await refreshWithLogin({
        gameId: game === "all" ? null : Number(game), canManage,
        loadDashboard: () => load(game, logStatus),
        connect: (source) => new Promise((resolve, reject) => { loginCompletion.current = { resolve, reject }; setLoginRequest(source); }),
        startRun: (body) => apiJson("/api/gameinfo/russia-check/refresh", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), fallbackError: "เริ่ม Russia Check ไม่สำเร็จ",
        }),
        readRun: (id) => apiJson(`/api/gameinfo/russia-check/runs/${id}`, { fallbackError: "โหลดสถานะ Russia Check ไม่สำเร็จ" }),
        onProgress: setRefreshProgress,
      });
      setRefreshResult({
        status: run.status,
        games: (run.sources || []).map((source) => ({
          gameName: source.gameName,
          count: (source.addedCount || 0) + (source.removedCount || 0) + (source.restoredCount || 0),
        })).filter((item) => item.count > 0),
        failedGames: (run.sources || []).filter((source) => source.status === "failed").map((source) => ({
          gameName: source.gameName,
          reason: source.error || "เชื่อมต่อร้านหรือโหลดรายการแพ็กไม่สำเร็จ",
        })),
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Russia Check ไม่สำเร็จ");
    } finally {
      refreshActive.current = false;
      setLoginRequest(null);
      loginCompletion.current = null;
      setRefreshProgress("");
      setRunning(false);
    }
  }

  function finishRefreshLogin(cancelled = false) {
    const completion = loginCompletion.current;
    loginCompletion.current = null;
    setLoginRequest(null);
    setConnectingBrowser(false);
    if (cancelled) completion?.reject(Error("ยกเลิกการรีข้อมูล ข้อมูลแพ็กเดิมยังอยู่"));
    else completion?.resolve();
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "50", cursor: nextCursor });
      if (game !== "all") query.set("gameId", game);
      if (logStatus !== "all") query.set("eventType", logStatus);
      if (game !== "all" && logDate) query.set("date", logDate);
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
    if (!selectedGame?.sourceId || connectingBrowser || (isInfold && !manualLogin)) return;
    setSavingSession(true);
    setError("");
    try {
      const result = await apiJson(`/api/gameinfo/russia-check/sources/${selectedGame.sourceId}/session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isInfold ? { formData: sessionCookie } : { sessionCookie }),
          expiresAt: sessionExpiresAt ? new Date(sessionExpiresAt).toISOString() : null,
        }),
        fallbackError: "บันทึก session ไม่สำเร็จ",
      });
      setSessionCookie("");
      setSessionExpiresAt("");
      setSessionDialog(false);
      setSessionNotice(result.authState === "verified" ? `ตรวจสอบ Login ผ่าน พบ ${result.verifiedPackCount} แพ็ก กดรีข้อมูลเพื่อบันทึกแพ็กและ Log` : "บันทึก Session แล้ว แต่ยังไม่ผ่านการตรวจสอบ");
      await load(game, logStatus);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "บันทึก session ไม่สำเร็จ");
    } finally {
      setSavingSession(false);
    }
  }

  async function browserConnected(result) {
    setSessionNotice(`ตรวจสอบ Login ผ่าน พบ ${result.packCount} แพ็ก กดรีข้อมูลเพื่อบันทึกแพ็กและ Log`);
    await load(game, logStatus);
    setSessionDialog(false);
    setSessionCookie("");
    setSessionExpiresAt("");
    setManualLogin(false);
  }

  async function disconnectSession() {
    if (!selectedGame?.sourceId || !window.confirm("ลบ session ที่เก็บไว้สำหรับเกมนี้หรือไม่?")) return;
    setSavingSession(true);
    setError("");
    setSessionNotice("");
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
  const allPackItems = useMemo(() => (dashboard.items || [])
    .map((item) => ({ ...item, displayStatus: russiaCheckDisplayStatus(item, dashboard.dailyLog?.endAt) })), [dashboard.items, dashboard.dailyLog?.endAt]);
  const packItems = useMemo(() => filterPacks(allPackItems, status, search), [allPackItems, status, search]);
  const newPackCount = allPackItems.filter((item) => item.displayStatus === "added").length;
  const resultLabel = runResultLabel(latest, latestChanges);
  const sourceDescription = demoSelected ? "ข้อมูลตัวอย่าง · อ่านอย่างเดียว" : !selectedGame ? "ดูภาพรวมทุกเกม หรือเลือกเกมเพื่อเปิดร้านและจัดการ Login" : selectedGame.provider === "xsolla" ? "ร้านรัสเซีย · ภาษาอังกฤษ · ไม่ต้อง Login" : selectedGame.provider === "midasbuy" ? "ร้านประเทศไทย · ภาษาอังกฤษ · ไม่ต้อง Login" : selectedGame.provider === "skystone" ? "ร้าน EU/NA · ภาษาอังกฤษ · ไม่ต้อง Login" : "ใช้บัญชีและพื้นที่ที่เชื่อมไว้กับเกมนี้";
  const groups = useMemo(() => {
    const byGame = new Map();
    for (const event of logs) {
      const key = String(event.gameId);
      if (!byGame.has(key)) byGame.set(key, { gameId: event.gameId, gameName: event.gameName, events: [] });
      byGame.get(key).events.push(event);
    }
    return [...byGame.values()];
  }, [logs]);
  return (
    <div data-shadcn-focus className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3">
        <Link href={`/gameinfo/${lang}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}><ArrowLeft data-icon="inline-start" />กลับ GameInfo</Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Russia Check</h1>
            <p className="text-sm text-muted-foreground">ติดตามแพ็กเข้า–ออก และความเปลี่ยนแปลงของแต่ละเกม</p>
          </div>
          <nav aria-label="หน้าอื่นของ Russia Check" className="flex flex-wrap items-center gap-2">
            <Link href={`/gameinfo/${lang}/russia-check/logins`} className={buttonVariants({ variant: "outline" })}><LogIn data-icon="inline-start" />สถานะ Login</Link>
            <Link href={`/gameinfo/${lang}/russia-check/game-logs`} className={buttonVariants({ variant: "outline" })}><Clock3 data-icon="inline-start" />Log รายเกม</Link>
            {canManage ? <Link href={`/gameinfo/${lang}/russia-check/extension`} className={buttonVariants({ variant: "ghost" })}><Download data-icon="inline-start" />โหลดส่วนขยาย</Link> : null}
          </nav>
        </div>
      </header>

      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <Field className="w-full sm:w-72">
                <FieldLabel htmlFor="russia-check-game">เกมที่กำลังดู</FieldLabel>
                <Select items={gameItems} value={game} onValueChange={selectGame} disabled={running || loading}>
                  <SelectTrigger id="russia-check-game" aria-label="เลือกเกม" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{gameItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
              {selectedGame?.storeUrl ? <a href={selectedGame.storeUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><ExternalLink data-icon="inline-start" />เปิดหน้าเว็บ</a> : null}
              {selectedGame?.authRequired && canManage ? <Button variant="outline" disabled={running || loading} onClick={() => setSessionDialog(true)}><KeyRound data-icon="inline-start" />จัดการ Login</Button> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">{sourceDescription}</p>
              {selectedGame?.authRequired ? <Badge variant={selectedGame.authState === "verified" ? "success" : selectedGame.authExpired || selectedGame.authState === "invalid" ? "destructive" : "secondary"}><KeyRound data-icon="inline-start" />{authLabel}</Badge> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
            <Button className="min-w-28" onClick={refresh} disabled={!canRefresh || running || loading || demoSelected || (Boolean(refreshBlockedReason) && !canReconnect)} aria-describedby={refreshBlockedReason ? "russia-check-source-blocked" : undefined} title={demoSelected ? "demo data เป็นข้อมูลตัวอย่างแบบอ่านอย่างเดียว" : canReconnect ? "เชื่อม Login แล้วรีข้อมูล" : refreshBlockedReason || (canRefresh ? "ดึงข้อมูลตามเกมที่เลือก" : "ต้องมีสิทธิ์ Market Check")}>
              {running ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              {running ? "กำลังตรวจ…" : game === "all" ? "รีทุกเกม" : "รีเกมนี้"}
            </Button>
            <p role="status" className="min-h-4 max-w-80 text-xs text-muted-foreground">{running ? refreshProgress || "กำลังเริ่มตรวจ…" : demoSelected ? "ข้อมูลตัวอย่าง ไม่ดึงจากร้านจริง" : !canRefresh ? "ต้องมีสิทธิ์ Market Check เพื่อรีข้อมูล" : "ตรวจอัตโนมัติทุกวัน 09:00 น. เวลาไทย"}</p>
          </div>
        </CardContent>
        <CardFooter>
          <dl className="grid w-full gap-3 text-xs sm:grid-cols-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><dt className="text-muted-foreground">ผลรอบล่าสุด</dt><dd className="font-medium">{resultLabel}</dd></div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><dt className="text-muted-foreground">ตรวจล่าสุด</dt><dd>{latest ? formatBangkok(latest.finishedAt || latest.createdAt) : "ยังไม่เคยตรวจ"}</dd></div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><dt className="text-muted-foreground">รอบถัดไป</dt><dd>{demoSelected || refreshBlockedReason ? "ยังไม่มีกำหนด" : formatBangkok(dashboard.nextRunAt)}</dd></div>
          </dl>
        </CardFooter>
      </Card>

      {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {sessionNotice ? <Alert><ShieldCheck /><AlertTitle>ผลการจัดการ Login</AlertTitle><AlertDescription role="status">{sessionNotice}</AlertDescription></Alert> : null}
      {refreshBlockedReason && !demoSelected ? <Alert><AlertCircle /><AlertTitle>ยังรีข้อมูลเกมนี้ไม่ได้</AlertTitle><AlertDescription id="russia-check-source-blocked">{refreshBlockedReason}</AlertDescription></Alert> : null}
      {game === "all" && unavailableGames.length ? <Alert><AlertCircle /><AlertTitle>บางเกมยังไม่พร้อมตรวจ</AlertTitle><AlertDescription>กดรีเพื่อเชื่อม Login ที่ขาดทีละเกม: {unavailableGames.map((item) => item.gameName).join(", ")} · รอบอัตโนมัติข้ามเกมที่รอ Login โดยไม่เปลี่ยนข้อมูลเดิม</AlertDescription></Alert> : null}

      <Tabs defaultValue="packs">
        <div className="border-b pb-1"><TabsList variant="line" aria-label="ข้อมูลแพ็ก"><TabsTrigger value="packs"><PackageCheck data-icon="inline-start" />แพ็กปัจจุบัน</TabsTrigger><TabsTrigger value="logs"><Clock3 data-icon="inline-start" />Log</TabsTrigger></TabsList></div>
        <TabsContent value="packs" className="flex flex-col gap-4 pt-2">
          <dl aria-label="สรุปแพ็กของเกมที่เลือก" className="grid grid-cols-2 gap-x-6 gap-y-3 border-b pb-4 sm:grid-cols-4">
            <PackCount title="มีอยู่" value={dashboard.summary.active} />
            <PackCount title="เพิ่มใหม่ใน 24 ชม." value={newPackCount} />
            <PackCount title="รอยืนยันหาย" value={dashboard.summary.pending} />
            <PackCount title="หายแล้ว" value={dashboard.summary.removed} />
          </dl>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Field className="w-full sm:max-w-sm">
              <FieldLabel htmlFor="russia-check-search">ค้นหาชื่อ Pack</FieldLabel>
              <Input id="russia-check-search" type="search" placeholder="พิมพ์ชื่อแพ็กที่ต้องการ…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </Field>
            <Field className="w-full sm:w-56">
              <FieldLabel htmlFor="russia-check-status">สถานะ Pack</FieldLabel>
              <Select items={STATUS_ITEMS} value={status} onValueChange={setStatus}>
                <SelectTrigger id="russia-check-status" aria-label="กรองสถานะ Pack" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{STATUS_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          </div>
          {loading ? <LoadingTable /> : packItems.length ? <PackTable items={packItems} showGame={game === "all"} /> : <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageCheck /></EmptyMedia><EmptyTitle>{search || status !== "all" ? "ไม่พบ Pack ตามตัวกรอง" : "ยังไม่มี Pack"}</EmptyTitle><EmptyDescription>{search || status !== "all" ? "ลองใช้ชื่ออื่น หรือเลือกดูทุกสถานะ" : refreshBlockedReason || "กดรีข้อมูลเพื่อสร้างข้อมูลตั้งต้น"}</EmptyDescription></EmptyHeader>{search || status !== "all" ? <Button variant="outline" onClick={() => { setSearch(""); setStatus("all"); }}>ล้างตัวกรอง</Button> : null}</Empty>}
        </TabsContent>
        <TabsContent value="logs" className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-muted-foreground">ประวัติแพ็กเข้า–ออก เรียงจากใหม่ไปเก่า แยกตามเกม</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {game !== "all" ? <Field className="w-full sm:w-44">
              <FieldLabel htmlFor="russia-check-log-date">วันที่เกิดรายการ</FieldLabel>
              <Input id="russia-check-log-date" type="date" value={logDate} onChange={selectLogDate} disabled={loading || loadingMore} />
            </Field> : null}
            <Field className="w-full sm:w-56">
              <FieldLabel htmlFor="russia-check-log-status">สถานะ Log</FieldLabel>
              <Select items={LOG_STATUS_ITEMS} value={logStatus} onValueChange={selectLogStatus} disabled={loading || loadingMore}>
                <SelectTrigger id="russia-check-log-status" aria-label="กรองสถานะ Log" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{LOG_STATUS_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            </div>
          </div>
          {loading ? <LoadingLog /> : groups.length ? groups.map((group) => <LogGroup key={group.gameId} group={group} />) : <Empty><EmptyHeader><EmptyMedia variant="icon"><Clock3 /></EmptyMedia><EmptyTitle>ยังไม่มี Log ตามสถานะนี้</EmptyTitle><EmptyDescription>ลองเลือกสถานะอื่น กดรีข้อมูล หรือรอรอบอัตโนมัติ</EmptyDescription></EmptyHeader></Empty>}
          {!loading && nextCursor ? <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="self-center">{loadingMore ? <Spinner data-icon="inline-start" /> : null}โหลดเพิ่มเติม</Button> : null}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(loginRequest)} onOpenChange={(open) => { if (!open && !connectingBrowser) finishRefreshLogin(true); }}>
        <DialogContent showCloseButton={!connectingBrowser} className="sm:max-w-lg">
          <DialogHeader><DialogTitle>ต้อง Login · {loginRequest?.gameName}</DialogTitle><DialogDescription>Session ขาดหรือหมดอายุ เชื่อมบัญชีนี้ก่อน แล้วระบบจะตรวจเกมถัดไปและรีข้อมูลต่อโดยอัตโนมัติ</DialogDescription></DialogHeader>
          {loginRequest ? <GameinfoRussiaCheckBrowserConnect key={loginRequest.sourceId} sourceId={loginRequest.sourceId} provider={loginRequest.connectorProvider || loginRequest.provider} lang={lang} autoStart onBusyChange={setConnectingBrowser} onConnected={() => finishRefreshLogin()} onCancelled={() => finishRefreshLogin(true)} /> : null}
          <DialogFooter><Button variant="outline" onClick={() => finishRefreshLogin(true)} disabled={connectingBrowser}>ยกเลิกการรี</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(refreshResult)} onOpenChange={(open) => { if (!open) setRefreshResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{refreshResult?.status === "failed" ? <AlertCircle className="size-5 text-destructive" /> : <Check className="size-5 text-green-600" />}{refreshResult?.status === "failed" ? "รีข้อมูลไม่สำเร็จ" : "รีข้อมูลเสร็จแล้ว"}</DialogTitle>
            <DialogDescription>{refreshResult?.status === "failed" ? `ตรวจไม่สำเร็จ ${refreshResult.failedGames.length} เกม ข้อมูลแพ็กเดิมยังอยู่` : refreshResult?.status === "partial" ? `ตรวจสำเร็จบางส่วน มี ${refreshResult.failedGames.length} เกมที่ยังสรุปไม่ได้` : refreshResult?.games.length ? "เกมที่มีการเปลี่ยนแปลง" : "ตรวจครบทุกเกมแล้ว ไม่มีเกมที่มีการเปลี่ยนแปลง"}</DialogDescription>
          </DialogHeader>
          {refreshResult?.games.length ? <ul className="divide-y rounded-md border">
            {refreshResult.games.map((item) => <li key={item.gameName} className="flex items-center justify-between gap-4 px-4 py-3"><span className="font-medium">{item.gameName}</span><Badge variant="secondary">{item.count} รายการ</Badge></li>)}
          </ul> : null}
          {refreshResult?.failedGames.length ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm font-medium text-destructive">เกมที่ตรวจไม่สำเร็จ</p><ul className="mt-3 space-y-3">{refreshResult.failedGames.map((item) => <li key={item.gameName} className="text-sm"><div className="flex items-center gap-2"><span className="font-medium">{item.gameName}</span><Badge variant="destructive">ยังสรุปไม่ได้</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p></li>)}</ul></div> : null}
          <DialogFooter><Button onClick={() => setRefreshResult(null)}>ปิด</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sessionDialog} onOpenChange={changeSessionDialog}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={saveSession} className="contents">
            <DialogHeader>
              <DialogTitle>เก็บ Session · {selectedGame?.gameName}</DialogTitle>
              <DialogDescription>{hasBrowserLogin ? "เชื่อมผ่าน popup ของส่วนขยาย แล้วทดสอบโหลดแพ็กก่อนบันทึก Session แบบเข้ารหัส" : "บันทึก Cookie แบบเข้ารหัสฝั่งเซิร์ฟเวอร์เท่านั้น ยังไม่ได้ตรวจสอบ Login กับผู้ให้บริการ"}</DialogDescription>
            </DialogHeader>
            {hasBrowserLogin ? <>
              <GameinfoRussiaCheckBrowserConnect sourceId={selectedGame.sourceId} provider={selectedGame.connectorProvider || selectedGame.provider} lang={lang} disabled={savingSession || running} onBusyChange={setConnectingBrowser} onConnected={browserConnected} />
              {isInfold ? <Button type="button" variant="ghost" onClick={() => setManualLogin((value) => !value)} disabled={savingSession || connectingBrowser} aria-expanded={manualLogin}>{manualLogin ? "ซ่อนการนำเข้าแบบเดิม" : "ใช้ Form Data แบบเดิม (ทางเลือกสำรอง)"}</Button> : null}
            </> : null}
            {!hasBrowserLogin || manualLogin ? <>
            {isInfold ? <Alert><KeyRound /><AlertTitle>ใช้ Form Data ไม่ใช่ Cookie</AlertTitle><AlertDescription>ล็อกอินและเลือกตัวละครจนเห็นแพ็ก → Network → products → Payload → View source แล้วคัดลอกทั้งชุดมาวางที่นี่เท่านั้น ไม่ส่งในแชต ระบบใช้บัญชี/ตัวละคร/พื้นที่เดิมตามคำขอ ไม่ได้บังคับเป็น RU</AlertDescription></Alert> : null}
            {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <FieldGroup>
              <Field data-invalid={Boolean(error)} data-disabled={savingSession}>
                <FieldLabel htmlFor="russia-check-session-cookie">{isInfold ? "Form Data จาก products" : "Cookie"}</FieldLabel>
                <Textarea id="russia-check-session-cookie" value={sessionCookie} onChange={(event) => setSessionCookie(event.target.value)} placeholder={isInfold ? `app_id=1010001&timestamp=...&sign_type=hmac&clientid=${isInfinityNikki ? "1116" : "1067"}&lang=${isInfinityNikki ? "th-th" : "en"}&data=...&sign=...` : "cookie_name=value; another_cookie=value"} maxLength={isInfold ? 65536 : 16384} disabled={savingSession} aria-invalid={Boolean(error)} spellCheck={false} autoComplete="off" rows={5} required aria-describedby="russia-check-session-help" />
                <FieldDescription id="russia-check-session-help">{isInfold ? "ต้องมี data และ sign ครบ คำขอนี้มีข้อมูล Login ห้ามแชร์ให้ผู้อื่น" : "ใส่เฉพาะค่าใน Request Header ชื่อ Cookie และอย่าส่งรหัสผ่านบัญชี"}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="russia-check-session-expiry">วันหมดอายุ (ถ้าทราบ)</FieldLabel>
                <Input id="russia-check-session-expiry" type="datetime-local" value={sessionExpiresAt} onChange={(event) => setSessionExpiresAt(event.target.value)} />
                <FieldDescription>เว้นว่างได้หากไม่ทราบ วันหมดอายุนี้เป็นข้อมูลที่กรอกเอง ไม่ใช่ผลตรวจสอบจาก Infold</FieldDescription>
              </Field>
            </FieldGroup>
            </> : null}
            <DialogFooter>
              {selectedGame?.authConfigured ? <Button type="button" variant="destructive" onClick={disconnectSession} disabled={savingSession || connectingBrowser}>ลบ Session</Button> : null}
              <Button type="button" variant="outline" onClick={() => changeSessionDialog(false)} disabled={savingSession || connectingBrowser}>ปิด</Button>
              {!hasBrowserLogin || manualLogin ? <Button type="submit" disabled={savingSession || connectingBrowser || !sessionCookie.trim()}>{savingSession ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}{savingSession ? "กำลังตรวจสอบและบันทึก…" : isInfold ? "ทดสอบและบันทึก Login" : "บันทึก Session"}</Button> : null}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function filterPacks(items, status, search) {
  const query = search.normalize("NFKC").trim().toLocaleLowerCase();
  return items.filter((item) => (status === "all" || item.displayStatus === status)
    && item.name.normalize("NFKC").toLocaleLowerCase().includes(query));
}

function runResultLabel(latest, changes) {
  if (!latest) return "ยังไม่มีผลการตรวจ";
  if (latest.status === "failed") return "ตรวจไม่สำเร็จ";
  if (latest.status === "queued") return "รอคิวตรวจ";
  if (latest.status === "running") return "กำลังตรวจ…";
  if (latest.status === "partial") return `ตรวจสำเร็จบางส่วน · เปลี่ยนแปลง ${changes} รายการ`;
  return changes ? `เปลี่ยนแปลง ${changes} รายการ` : "ไม่มีการเปลี่ยนแปลง";
}

function PackCount({ title, value }) {
  return <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><dt className="text-xs text-muted-foreground">{title}</dt><dd className="order-first text-2xl font-semibold tabular-nums">{value}</dd></div>;
}

function PackTable({ items, showGame }) {
  return <Card size="sm" className="min-w-0">
    <CardHeader className="flex flex-wrap items-center justify-between gap-2"><CardTitle>รายการ Pack</CardTitle><CardDescription aria-live="polite">{items.length} รายการ · วันที่และเวลาไทย</CardDescription></CardHeader>
    <CardContent>
      <Table containerClassName="focus-visible:outline-ring" tabIndex={0} aria-label="รายการ Pack ตามตัวกรอง">
        <TableHeader><TableRow><TableHead scope="col">ชื่อ Pack</TableHead>{showGame ? <TableHead scope="col">เกม</TableHead> : null}<TableHead scope="col">สถานะ</TableHead><TableHead scope="col">วันที่มีการเคลื่อนไหวล่าสุด</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((item, index) => <TableRow key={`${item.gameId}:${item.name}:${index}`}>
          <TableCell><div className="flex min-w-56 max-w-md items-center justify-between gap-2"><span className="whitespace-normal break-words font-medium">{item.name}</span><CopyPackName key={item.name} name={item.name} /></div></TableCell>
          {showGame ? <TableCell><span className="text-xs text-muted-foreground">{item.gameName}</span></TableCell> : null}
          <TableCell><div className="flex flex-col items-start gap-1"><Badge variant={statusBadge(item.displayStatus)}>{STATUS_LABELS[item.displayStatus]}</Badge>{item.status === "pending_removal" ? <span className="text-xs text-muted-foreground">รอยืนยันหาย · {item.missingRuns}/2 ครั้ง</span> : null}</div></TableCell>
          <TableCell><time dateTime={latestMovementAt(item) || undefined} className="text-xs tabular-nums">{formatBangkok(latestMovementAt(item))}</time></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent>
  </Card>;
}

function LogGroup({ group }) {
  return <Card size="sm"><CardHeader><CardTitle>{group.gameName}</CardTitle><CardDescription>{group.events.length} เหตุการณ์ที่โหลดแล้ว</CardDescription></CardHeader><CardContent><ol className="divide-y">{group.events.map((event) => <li key={event.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 flex-wrap items-center gap-2"><Badge variant={eventBadge(event.eventType)}>{event.eventType === "restored" ? <RotateCcw data-icon="inline-start" /> : event.eventType === "removed" ? <PackageMinus data-icon="inline-start" /> : <PackagePlus data-icon="inline-start" />}{EVENT_LABELS[event.eventType]}</Badge><span className="min-w-0 break-words font-medium">{event.packName}</span><CopyPackName key={event.packName} name={event.packName} /></div><time dateTime={event.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBangkok(event.createdAt)}</time></li>)}</ol></CardContent></Card>;
}

function CopyPackName({ name }) {
  const [copyState, setCopyState] = useState("idle");
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function copyName() {
    setCopyState("pending");
    try {
      await navigator.clipboard.writeText(name);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return <span className="inline-flex shrink-0 items-center gap-1">
    <Button type="button" variant="ghost" size="icon-sm" onClick={copyName} disabled={copyState === "pending"} title="คัดลอกชื่อ Pack" aria-label={`คัดลอกชื่อ Pack: ${name}`}>
      {copyState === "pending" ? <Spinner data-icon="inline-start" /> : copyState === "copied" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
    </Button>
    <span role="status" aria-live="polite" className={cn("text-xs", copyState === "failed" ? "text-destructive" : "text-muted-foreground")}>
      {copyState === "copied" ? "คัดลอกแล้ว" : copyState === "failed" ? "คัดลอกไม่สำเร็จ ลองเลือกชื่อแล้วคัดลอกเอง" : ""}
    </span>
  </span>;
}

function LoadingTable() {
  return <Card><CardHeader><CardTitle>กำลังโหลดรายการ Pack</CardTitle><CardDescription>กำลังอ่านข้อมูลตามตัวกรอง</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</CardContent></Card>;
}

function LoadingLog() {
  return <Card><CardHeader><CardTitle>กำลังโหลด Log</CardTitle><CardDescription>กำลังอ่านเหตุการณ์ตามสถานะ</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-12 w-full" />)}</CardContent></Card>;
}
