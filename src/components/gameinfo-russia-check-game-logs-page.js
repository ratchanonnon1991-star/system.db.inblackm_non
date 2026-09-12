"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatBangkok(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function GameinfoRussiaCheckGameLogsPage({ initialLog, lang }) {
  const [log, setLog] = useState(initialLog);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function reload() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const next = await apiJson("/api/gameinfo/russia-check/game-logs", { fallbackError: "โหลด Log รายเกมไม่สำเร็จ" });
        if (!cancelled) { setLog(next); setError(""); }
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "โหลด Log รายเกมไม่สำเร็จ");
      } finally {
        inFlight = false;
      }
    }
    const timer = setInterval(reload, 60_000);
    document.addEventListener("visibilitychange", reload);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", reload); };
  }, []);

  const labels = { changed: "มีการเปลี่ยนแปลง", unchanged: "ไม่มีการเปลี่ยนแปลง", unchecked: "ยังตรวจไม่ครบใน 24 ชม." };
  return <div data-shadcn-focus className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
    <header className="flex flex-col items-start gap-3">
      <Link href={`/gameinfo/${lang}/russia-check`} className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowLeft data-icon="inline-start" />กลับ Russia Check</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Log รายเกม</h1>
      <p className="text-sm text-muted-foreground">รวมทุกเกม ย้อนหลัง 24 ชั่วโมง ไม่ตัดรอบวัน · อ่านสถานะล่าสุดทุกนาที</p>
    </header>
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>โหลดสรุปรายเกมไม่สำเร็จ</AlertTitle><AlertDescription>{error} · กำลังแสดงข้อมูลที่โหลดสำเร็จล่าสุด ระบบจะลองใหม่อัตโนมัติ</AlertDescription></Alert> : null}
    <Card>
      <CardHeader>
        <CardTitle>24 ชั่วโมงล่าสุด · ทุกเกม</CardTitle>
        <CardDescription>นับแพ็กเพิ่ม หาย หรือกลับมา หากยังตรวจไม่ครบ จะยังไม่สรุปว่าไม่มีการเปลี่ยนแปลง{log?.startAt && log?.endAt ? ` · ช่วง ${formatBangkok(log.startAt)} ถึง ${formatBangkok(log.endAt)} (เวลาไทย)` : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        {log?.games?.length ? <Table aria-label="การเปลี่ยนแปลงรายเกมใน 24 ชั่วโมงล่าสุด">
          <TableHeader><TableRow><TableHead scope="col">เกม</TableHead><TableHead scope="col">สถานะใน 24 ชม.</TableHead></TableRow></TableHeader>
          <TableBody>{log.games.map((item) => <TableRow key={item.gameId}>
            <TableCell><div className="flex items-center gap-2">
              <span>{item.gameName}</span>
              <Link href={`/gameinfo/${lang}/russia-check?gameId=${item.gameId}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`ดู Pack ของ ${item.gameName}`}>ดู Pack<ArrowRight data-icon="inline-end" /></Link>
            </div></TableCell>
            <TableCell><Badge variant={item.status === "changed" ? "success" : item.status === "unchanged" ? "secondary" : "outline"}>{labels[item.status] || labels.unchecked}</Badge></TableCell>
          </TableRow>)}</TableBody>
        </Table> : <Empty><EmptyHeader><EmptyTitle>ยังไม่มีเกมที่ติดตาม</EmptyTitle><EmptyDescription>เมื่อมีเกมที่ติดตาม สรุปทุกเกมจะแสดงที่นี่</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>
    </Card>
  </div>;
}
