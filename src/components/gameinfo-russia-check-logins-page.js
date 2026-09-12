"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, KeyRound, LogIn, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import GameinfoRussiaCheckBrowserConnect from "@/components/gameinfo-russia-check-browser-connect";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BROKEN = new Set(["missing", "expired", "invalid", "saved_unverified"]);
const STATUS = {
  verified: { label: "ใช้งานได้", variant: "success" },
  invalid: { label: "Session หลุด", variant: "destructive" },
  expired: { label: "Session หมดอายุ", variant: "destructive" },
  missing: { label: "ยังไม่ได้ Login", variant: "secondary" },
  saved_unverified: { label: "ยังไม่ยืนยัน", variant: "secondary" },
};

function formatBangkok(value) {
  return value ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
}

export default function GameinfoRussiaCheckLoginsPage({ initialGames, canManage, lang }) {
  const [games, setGames] = useState(initialGames);
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);

  async function reload() {
    const dashboard = await apiJson("/api/gameinfo/russia-check", { fallbackError: "โหลดสถานะ Login ไม่สำเร็จ" });
    const next = (dashboard.games || []).filter((game) => game.authRequired);
    setGames(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden" || current) return;
      try {
        const dashboard = await apiJson("/api/gameinfo/russia-check", { fallbackError: "โหลดสถานะ Login ไม่สำเร็จ" });
        if (!cancelled) setGames((dashboard.games || []).filter((game) => game.authRequired));
      } catch { /* Keep the last successful status. */ }
    }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [current]);

  function beginLogin(targets) {
    if (!targets.length) return;
    setError(""); setNotice(""); setCurrent(targets[0]); setQueue(targets.slice(1));
  }

  async function connected() {
    const finishedName = current.gameName;
    const nextGames = await reload();
    const next = queue.map((queued) => nextGames.find((game) => game.sourceId === queued.sourceId)).filter(Boolean);
    if (next.length) { setCurrent(next[0]); setQueue(next.slice(1)); }
    else { setCurrent(null); setQueue([]); setNotice(`Login สำเร็จ · ${finishedName}${queue.length ? " และเกมที่เลือกทั้งหมด" : ""}`); }
  }

  async function logout(game) {
    if (!window.confirm(`Logout ${game.gameName} และลบ Session ที่เก็บไว้หรือไม่?`)) return;
    setError(""); setNotice("");
    try {
      await apiJson(`/api/gameinfo/russia-check/sources/${game.sourceId}/session`, { method: "DELETE", fallbackError: "Logout ไม่สำเร็จ" });
      await reload();
      setNotice(`Logout ${game.gameName} แล้ว`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Logout ไม่สำเร็จ"); }
  }

  async function checkSessions(sourceId = null) {
    if (checking) return;
    setChecking(true); setError(""); setNotice("");
    try {
      const checked = await apiJson("/api/gameinfo/russia-check/sessions/check", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId }), fallbackError: "เช็ค Session ไม่สำเร็จ",
      });
      const nextGames = await reload();
      const brokenIds = new Set((checked.results || []).filter((item) => BROKEN.has(item.status)).map((item) => item.sourceId));
      const targets = nextGames.filter((game) => brokenIds.has(game.sourceId));
      const failures = (checked.results || []).filter((item) => item.status === "error");
      if (failures.length) setError(`เช็คไม่สำเร็จ ${failures.length} เกม กรุณาลองใหม่`);
      if (targets.length) beginLogin(targets);
      else if (!failures.length) setNotice(sourceId ? "Session เกมนี้ยังใช้งานได้" : "Session ทุกเกมยังใช้งานได้");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เช็ค Session ไม่สำเร็จ"); }
    finally { setChecking(false); }
  }

  const broken = games.filter((game) => BROKEN.has(game.authState));
  return <div data-shadcn-focus className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
    <header className="flex flex-col items-start gap-3">
      <Link href={`/gameinfo/${lang}/russia-check`} className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowLeft data-icon="inline-start" />กลับ Russia Check</Link>
      <div><h1 className="text-2xl font-semibold tracking-tight">สถานะ Login</h1><p className="mt-1 text-sm text-muted-foreground">เฉพาะเกมที่ต้องใช้ Session · อัปเดตสถานะทุกนาที</p></div>
    </header>
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert><ShieldCheck /><AlertTitle>สำเร็จ</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div><CardTitle>บัญชีที่เชื่อมกับ Russia Check</CardTitle><CardDescription>{broken.length ? `ต้อง Login ${broken.length} เกม` : "Session ทุกเกมพร้อมใช้งาน"}</CardDescription></div>
        {canManage ? <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={checking || busy} onClick={() => checkSessions()}>{checking ? <RefreshCw className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}เช็ค Session ทั้งหมด</Button>{broken.length ? <Button onClick={() => beginLogin(broken)}><LogIn data-icon="inline-start" />Login ทุกเกมที่หลุด</Button> : null}</div> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {games.map((game) => {
          const state = STATUS[game.authState] || STATUS.missing;
          const failure = game.authState === "invalid" && game.lastFailedAt ? `หลุดตอนรี${game.lastFailedTrigger === "scheduled" ? "อัตโนมัติ" : "ด้วยมือ"} · ${formatBangkok(game.lastFailedAt)}` : null;
          return <div key={game.sourceId} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{game.gameName}</span><Badge variant={state.variant}>{state.label}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{failure || (game.authState === "verified" ? `ยืนยันล่าสุด ${formatBangkok(game.authVerifiedAt)}` : "ต้องเชื่อมบัญชีเพื่อใช้การรีอัตโนมัติ")}</p></div>
            {canManage ? <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" disabled={checking || busy} onClick={() => checkSessions(game.sourceId)}><ShieldCheck data-icon="inline-start" />เช็ค</Button><Button variant="outline" onClick={() => beginLogin([game])}><KeyRound data-icon="inline-start" />Login</Button>{game.authConfigured ? <Button variant="outline" onClick={() => logout(game)}><LogOut data-icon="inline-start" />Logout</Button> : null}</div> : null}
          </div>;
        })}
      </CardContent>
    </Card>
    <Dialog open={Boolean(current)} onOpenChange={(open) => { if (!open && !busy) { setCurrent(null); setQueue([]); } }}>
      <DialogContent showCloseButton={!busy} className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Login · {current?.gameName}</DialogTitle><DialogDescription>{queue.length ? `เสร็จแล้วจะต่อเกมถัดไปอีก ${queue.length} เกม` : "เชื่อมและตรวจสอบ Session ของเกมนี้"}</DialogDescription></DialogHeader>
        {current ? <GameinfoRussiaCheckBrowserConnect key={current.sourceId} sourceId={current.sourceId} provider={current.connectorProvider || current.provider} lang={lang} autoStart onBusyChange={setBusy} onConnected={connected} /> : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setCurrent(null); setQueue([]); }}>ยกเลิก</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
