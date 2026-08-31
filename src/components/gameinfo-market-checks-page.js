"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, RotateCcw, Settings2, Store, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { GAMEINFO_MARKETS } from "@/lib/gameinfo-market-system";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

const MARKETS = GAMEINFO_MARKETS;
const FINISHED = new Set(["completed", "partial", "failed"]);
const AUTO_SCHEDULE_NOTE = "อัตโนมัติทุกวัน 09:00 น. เวลาไทย";

export default function GameinfoMarketChecksPage({ initialSellers, initialRuns = [], enabledCounts = {}, canCheck, canManage }) {
  const [runs, setRuns] = useState(() => Object.fromEntries(initialRuns.map((run) => [run.market, run])));
  const [error, setError] = useState("");
  const [sellers, setSellers] = useState(initialSellers);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(MARKETS.map((market) => [market.key, initialSellers.filter((seller) => seller.market === market.key).map((seller) => seller.sellerName)])));
  const [saving, setSaving] = useState("");
  const [confirmMarket, setConfirmMarket] = useState("");
  const [starting, setStarting] = useState("");
  const [resetMarket, setResetMarket] = useState("");
  const [resetting, setResetting] = useState("");

  useEffect(() => {
    const active = Object.values(runs).filter((run) => run && !FINISHED.has(run.status));
    if (!active.length) return;
    const timer = setInterval(async () => {
      for (const run of active) {
        try {
          const data = await apiJson(`/api/gameinfo/market-checks/${run.id}`);
          setRuns((current) => ({ ...current, [run.market]: data.run }));
        } catch (reason) {
          setError(reason.message || "โหลดสถานะ Check ไม่สำเร็จ");
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [runs]);

  async function start(market) {
    setStarting(market);
    setError("");
    try {
      const data = await apiJson(`/api/gameinfo/market-checks/${market}`, { method: "POST" });
      setRuns((current) => ({ ...current, [market]: data.run }));
      setConfirmMarket("");
    } catch (reason) {
      setError(reason.message || "เริ่ม Check ไม่สำเร็จ");
    } finally {
      setStarting("");
    }
  }

  // Closes out a run that never finished — otherwise the single-flight rule
  // keeps "กำลังตรวจ" on screen and the Check button disabled forever.
  async function reset(market) {
    setResetting(market);
    setError("");
    try {
      const data = await apiJson(`/api/gameinfo/market-checks/${market}`, { method: "DELETE" });
      setRuns((current) => ({ ...current, [market]: data.run }));
      setResetMarket("");
    } catch (reason) {
      setError(reason.message || "รีเซ็ตสถานะไม่สำเร็จ");
    } finally {
      setResetting("");
    }
  }

  function updateDraft(market, index, value) {
    setDrafts((current) => ({ ...current, [market]: current[market].map((item, itemIndex) => itemIndex === index ? value : item) }));
  }

  async function saveSellers(market) {
    setSaving(market);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/market-own-sellers", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ market, sellers: drafts[market].filter((name) => name.trim()).map((sellerName) => ({ sellerName, enabled: true })) }),
      });
      setSellers((current) => [...current.filter((seller) => seller.market !== market), ...data.sellers]);
    } catch (reason) {
      setError(reason.message || "บันทึกร้านไม่สำเร็จ");
    } finally {
      setSaving("");
    }
  }

  const sellerCounts = useMemo(() => Object.fromEntries(MARKETS.map((market) => [market.key, sellers.filter((seller) => seller.market === market.key && seller.enabled).length])), [sellers]);
  const confirmMarketConfig = MARKETS.find((market) => market.key === confirmMarket);
  const resetMarketConfig = MARKETS.find((market) => market.key === resetMarket);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">Market Check</h2><p className="text-sm text-muted-foreground">ดึงข้อมูลทั้ง Market แยก job และตรวจร้านของเรากับราคา GameInfo · อัตโนมัติทุกวัน 09:00 น. เวลาไทย</p></div>
        {canManage ? <Sheet><SheetTrigger render={<Button type="button" variant="outline" />}><Settings2 data-icon="inline-start" />ตั้งค่าร้านของเรา</SheetTrigger><SheetContent className="sm:max-w-lg"><SheetHeader><SheetTitle>ร้านของเรา</SheetTitle><SheetDescription>รายการส่วนกลางของทั้งระบบ แยกตาม Market</SheetDescription></SheetHeader><div className="flex flex-col gap-6 overflow-y-auto px-4">
          {MARKETS.map((market) => <FieldGroup key={market.key}><div className="flex items-center justify-between"><div><FieldLabel>{market.label}</FieldLabel><FieldDescription>ตรวจทุกชื่อร้านในรอบเดียวกัน</FieldDescription></div><Button type="button" size="sm" variant="outline" onClick={() => setDrafts((current) => ({ ...current, [market.key]: [...current[market.key], ""] }))}><Plus data-icon="inline-start" />เพิ่มร้าน</Button></div>
            {drafts[market.key].map((name, index) => <Field key={`${market.key}-${index}`} orientation="horizontal"><FieldContent><Input value={name} onChange={(event) => updateDraft(market.key, index, event.target.value)} placeholder="ชื่อ Seller ตาม Market" /></FieldContent><Button type="button" variant="ghost" size="icon" aria-label="ลบร้าน" onClick={() => setDrafts((current) => ({ ...current, [market.key]: current[market.key].filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 /></Button></Field>)}
            <Button type="button" disabled={saving === market.key} onClick={() => saveSellers(market.key)}>{saving === market.key ? <Spinner data-icon="inline-start" /> : <Store data-icon="inline-start" />}บันทึก {market.label}</Button>
          </FieldGroup>)}
        </div><SheetFooter><p className="text-xs text-muted-foreground">ชื่อร้านต้องตรงกับ Seller ที่ Catalog โหลดมา</p></SheetFooter></SheetContent></Sheet> : null}
      </div>
      {error ? <Alert variant="destructive"><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {!MARKETS.some((market) => enabledCounts[market.key] > 0) ? <Alert><AlertTitle>ยังไม่มีเกมที่เปิด Market</AlertTitle><AlertDescription>ไปที่หน้า Packs ของเกม เลือก “จัดการ Market” เลือกเกมต้นทาง แล้วเปิด Market ก่อนกด Check ข้อมูลจึงจะถูกโหลดมาให้ Mapping</AlertDescription></Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">{MARKETS.map((market) => {
        const run = runs[market.key];
        const progress = run?.totalGames ? Math.round((run.completedGames + run.failedGames) / run.totalGames * 100) : 0;
        const running = run && !FINISHED.has(run.status);
        const enabledGames = enabledCounts[market.key] || 0;
        return <Card key={market.key}><CardHeader><CardTitle>{market.label}</CardTitle><CardDescription>เปิดใช้งาน {enabledGames} เกม · ร้านของเรา {sellerCounts[market.key] || 0} ร้าน · ไม่มี cooldown · {AUTO_SCHEDULE_NOTE}</CardDescription><CardAction className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!canCheck || !run || Boolean(resetting)} onClick={() => setResetMarket(market.key)} title={run ? "ล้างสถานะรอบล่าสุด" : "ยังไม่เคย Check"}>{resetting === market.key ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}Reset</Button><Button type="button" disabled={!canCheck || running || !enabledGames || Boolean(starting)} onClick={() => setConfirmMarket(market.key)}>{running || starting === market.key ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{running ? "กำลังตรวจ" : "Check ทั้ง Market"}</Button></CardAction></CardHeader><CardContent className="flex flex-col gap-4">
          {run ? <><div className="flex flex-wrap gap-2"><Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge><Badge variant="secondary">สำเร็จ {run.completedGames}</Badge>{run.failedGames ? <Badge variant="destructive">ล้มเหลว {run.failedGames}</Badge> : null}<Badge variant="secondary">Alerts {run.alertsOpened}</Badge></div><Progress value={progress}><ProgressLabel>ความคืบหน้า</ProgressLabel><ProgressValue /></Progress><p className="text-xs text-muted-foreground">ล่าสุด {new Date(run.finishedAt || run.startedAt || run.createdAt).toLocaleString("th-TH")}</p>{run.error ? <p className="text-sm text-destructive">{run.error}</p> : null}</> : <p className="text-sm text-muted-foreground">ยังไม่เคย Check · {AUTO_SCHEDULE_NOTE}</p>}
        </CardContent></Card>;
      })}</div>
      <Dialog open={Boolean(confirmMarket)} onOpenChange={(open) => { if (!open && !starting) setConfirmMarket(""); }}><DialogContent><DialogHeader><DialogTitle>ยืนยัน Check ทั้ง {confirmMarketConfig?.label || "Market"}</DialogTitle><DialogDescription>ระบบจะดึงข้อมูลล่าสุดของทุกเกมที่เปิด {confirmMarketConfig?.label || "Market"} แล้วตรวจราคาทุกร้านของเรา งานอาจใช้เวลาสักครู่และ Market เดียวกันรันได้ครั้งละหนึ่งงาน</DialogDescription></DialogHeader><DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={Boolean(starting)} />}>ยกเลิก</DialogClose><Button type="button" disabled={!confirmMarket || Boolean(starting)} onClick={() => start(confirmMarket)}>{starting ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{starting ? "กำลังเริ่ม" : "เริ่ม Check"}</Button></DialogFooter></DialogContent></Dialog>
      <AlertDialog open={Boolean(resetMarket)} onOpenChange={(open) => { if (!open && !resetting) setResetMarket(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>รีเซ็ตสถานะ {resetMarketConfig?.label || "Market"}</AlertDialogTitle>
            <AlertDialogDescription>
              ล้างรอบที่ค้างอยู่ของ {resetMarketConfig?.label || "Market"} เพื่อให้สั่ง Check ใหม่ได้ · ไม่ลบ Catalog, Mapping หรือ Alert ที่เคยบันทึกไว้ · ถ้ารอบเดิมยังทำงานอยู่จริง มันจะทำต่อจนจบเบื้องหลัง
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(resetting)}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction disabled={!resetMarket || Boolean(resetting)} onClick={() => reset(resetMarket)}>
              {resetting ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}รีเซ็ตสถานะ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!canCheck ? <Alert><AlertTitle>ดูสถานะได้อย่างเดียว</AlertTitle><AlertDescription>ต้องมีสิทธิ์ gameinfo.market_check จึงจะสั่ง Check ได้</AlertDescription></Alert> : null}
    </>
  );
}
