"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson(RATE_URL, { cache: "no-store" });
      setRates(Array.isArray(data.rates) ? data.rates : []);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "โหลดค่าเงินไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 60 * 60 * 1000);
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
  return (
    <section className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-linear-ink">อัตราแลกเปลี่ยน</h2>
          <span className="text-[10px] text-linear-ink-tertiary">อัปเดตทุก 1 ชม.</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="รีเฟรชอัตราแลกเปลี่ยน"
          title="รีเฟรช"
          className="flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {error ? <p role="alert" className="mb-2 text-xs text-linear-danger">{error}</p> : null}
      <TooltipProvider delay={150}>
        <div className="grid gap-2 sm:grid-cols-2">
          {rates.length === 0 ? (
            <p className="text-xs text-linear-ink-tertiary">{loading ? "กำลังโหลดค่าเงิน..." : "ยังไม่มีข้อมูลค่าเงิน"}</p>
          ) : rates.map((rate) => <RateCard key={rate.pair} rate={rate} />)}
        </div>
      </TooltipProvider>
    </section>
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
