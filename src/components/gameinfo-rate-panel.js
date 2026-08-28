"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const RATE_URL = "/api/gameinfo/rates?pairs=USDTTHB,USDCNY";

export function useGameinfoRates() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // force skips the server cache and calls the providers now; the interval and
  // first load pass nothing so background traffic never triggers a provider hit.
  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson(force ? `${RATE_URL}&refresh=1` : RATE_URL, { cache: "no-store" });
      setRates(Array.isArray(data.rates) ? data.rates : []);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "โหลดค่าเงินไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => refresh(), 0);
    const timer = window.setInterval(() => refresh(), 60 * 60 * 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const externalValues = useMemo(
    () => Object.fromEntries(rates.filter((rate) => rate.available).map((rate) => [rate.pair, rate.rate])),
    [rates]
  );
  return { rates, externalValues, loading, error, refresh };
}

export default function GameinfoRatePanel({ rates, loading, error, onRefresh }) {
  // Only a manual refresh asks first; the scheduler and the hourly reload run on
  // their own, matching the price compare panel.
  const [refreshPrompt, setRefreshPrompt] = useState(false);

  function confirmRefresh() {
    setRefreshPrompt(false);
    onRefresh(true);
  }

  return (
    <section className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-linear-ink">อัตราแลกเปลี่ยน</h2>
          <span className="text-[10px] text-linear-ink-tertiary">อัปเดตอัตโนมัติ</span>
        </div>
        <div className="flex items-center gap-1">
          <RateRefreshDetails />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setRefreshPrompt(true)}
            disabled={loading}
            aria-label="รีเฟรชอัตราแลกเปลี่ยน"
            title="รีเฟรช"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      {error ? <p role="alert" className="mb-2 text-xs text-linear-danger">{error}</p> : null}
      <TooltipProvider delay={150}>
        <div className="grid gap-2 sm:grid-cols-2">
          {rates.length === 0 ? (
            <p className="text-xs text-linear-ink-tertiary">{loading ? "กำลังโหลดค่าเงิน..." : "ยังไม่มีข้อมูลค่าเงิน"}</p>
          ) : rates.map((rate) => <RateCard key={rate.pair} rate={rate} />)}
        </div>
      </TooltipProvider>

      <Dialog open={refreshPrompt} onOpenChange={setRefreshPrompt}>
        <DialogContent
          className="border border-linear-hairline bg-linear-surface-1 text-linear-ink sm:max-w-md"
          style={{ boxShadow: "var(--ll-shadow-modal)" }}
        >
          <DialogHeader>
            <DialogTitle>ยืนยันการรีเฟรชอัตราแลกเปลี่ยน</DialogTitle>
            <DialogDescription className="text-linear-ink-subtle">
              จะดึงค่าใหม่จาก CoinGecko และ Frankfurter/ECB ทันที ข้ามแคชที่เก็บไว้ (รอบอัตโนมัติทำงานเองอยู่แล้ว)
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-linear-ink-tertiary">
            ถ้าผู้ให้บริการล้ม ระบบจะคงค่าล่าสุดที่สำเร็จไว้และขึ้นสถานะ stale ให้เห็น
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRefreshPrompt(false)}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={confirmRefresh} disabled={loading}>
              <RefreshCw data-icon="inline-start" className={loading ? "animate-spin" : ""} />
              รีเฟรช
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RateRefreshDetails() {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Info data-icon="inline-start" />
        Details
      </DialogTrigger>
      <DialogContent
        className="border border-linear-hairline bg-linear-surface-1 text-linear-ink sm:max-w-md"
        style={{ boxShadow: "var(--ll-shadow-modal)" }}
      >
        <DialogHeader>
          <DialogTitle>รายละเอียดการอัปเดตค่าเงิน</DialogTitle>
          <DialogDescription className="text-linear-ink-subtle">
            Server อัปเดตให้อัตโนมัติตามเวลาไทย แม้ไม่มีผู้ใช้เปิดหน้านี้
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <RateScheduleItem
            pair="USDT/THB"
            provider="CoinGecko"
            schedule="ทุกต้นชั่วโมง เวลา xx:00"
            cache="เก็บค่าไว้ 1 ชั่วโมง"
          />
          <RateScheduleItem
            pair="USD/CNY"
            provider="Frankfurter / ECB"
            schedule="ทุกวัน เวลา 11:05 และ 23:05"
            cache="เก็บค่าไว้ 12 ชั่วโมง"
          />
        </div>
        <p className="text-xs leading-5 text-linear-ink-tertiary">
          ปุ่มรีเฟรชด้านบนจะถามยืนยันก่อน แล้วดึงค่าใหม่จากผู้ให้บริการทันทีโดยข้ามแคช
        </p>
      </DialogContent>
    </Dialog>
  );
}

function RateScheduleItem({ pair, provider, schedule, cache }) {
  return (
    <div className="rounded-lg border border-linear-hairline bg-linear-surface-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-linear-ink">{pair}</p>
        <span className="rounded-full bg-linear-surface-3 px-2 py-0.5 text-xs text-linear-ink-muted">{provider}</span>
      </div>
      <p className="mt-2 text-xs text-linear-ink-subtle">{schedule}</p>
      <p className="mt-1 text-xs text-linear-ink-tertiary">{cache}</p>
    </div>
  );
}

function RateCard({ rate }) {
  const fetchedAt = rate.fetchedAt
    ? new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(rate.fetchedAt))
    : "ยังไม่เคยดึงสำเร็จ";
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`ดูกราฟอัตราแลกเปลี่ยน ${rate.pair}`}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-linear-hairline bg-linear-surface-1 px-3 py-2 text-left outline-none hover:bg-linear-surface-2 focus-visible:ring-2 focus-visible:ring-linear-primary"
      >
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-linear-ink-tertiary">{rate.pair}</p>
          <p className="text-lg font-semibold tabular-nums text-linear-ink">
            {rate.available ? Number(rate.rate).toLocaleString("th-TH", { maximumFractionDigits: 6 }) : "—"}
          </p>
        </div>
        <span className={`size-2 rounded-full ${rate.stale ? "bg-amber-500" : "bg-emerald-500"}`} title={rate.stale ? "ใช้ค่าล่าสุดที่มี" : "ข้อมูลล่าสุด"} />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="block w-64 max-w-[calc(100vw-1rem)] border border-linear-hairline bg-linear-surface-1 p-3 text-linear-ink shadow-none"
        style={{ boxShadow: "var(--ll-shadow-modal)" }}
      >
        <RateSparkline history={rate.history || []} />
        <p className="mt-1 text-[10px] text-linear-ink-tertiary">{rate.source || "ไม่ทราบแหล่งข้อมูล"} · {fetchedAt}</p>
        {rate.error ? <p className="mt-1 text-[10px] text-linear-warning">{rate.error}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function RateSparkline({ history }) {
  if (history.length < 2) return <div className="mt-2 h-9 rounded bg-linear-surface-3" />;
  const values = history.map((point) => Number(point.rate)).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 34 - ((value - min) / span) * 30;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 38" preserveAspectRatio="none" className="mt-2 h-9 w-full" role="img" aria-label="กราฟอัตราแลกเปลี่ยนย้อนหลัง">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="text-linear-primary" />
    </svg>
  );
}
