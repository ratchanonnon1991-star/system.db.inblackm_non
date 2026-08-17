"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";

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
    <section className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-linear-ink">อัตราแลกเปลี่ยน</h2>
          <p className="mt-0.5 text-xs text-linear-ink-tertiary">อัปเดตสูงสุดชั่วโมงละครั้งและใช้ค่าล่าสุดเมื่อ provider ขัดข้อง</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 rounded-md border border-linear-hairline-strong px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> รีเฟรช
        </button>
      </div>
      {error ? <p className="mb-2 text-xs text-red-400">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {rates.length === 0 ? (
          <p className="text-xs text-linear-ink-tertiary">{loading ? "กำลังโหลดค่าเงิน..." : "ยังไม่มีข้อมูลค่าเงิน"}</p>
        ) : rates.map((rate) => <RateCard key={rate.pair} rate={rate} />)}
      </div>
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
    <div className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-linear-ink-tertiary">{rate.pair}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-linear-ink">
            {rate.available ? Number(rate.rate).toLocaleString("th-TH", { maximumFractionDigits: 6 }) : "—"}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${rate.stale ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-400"}`}>
          {rate.stale ? "ค่าล่าสุด (stale)" : "ล่าสุด"}
        </span>
      </div>
      <RateSparkline history={rate.history || []} />
      <p className="mt-1 text-[10px] text-linear-ink-tertiary">{rate.source || "ไม่ทราบแหล่งข้อมูล"} · {fetchedAt}</p>
      {rate.error ? <p className="mt-1 text-[10px] text-amber-300">{rate.error}</p> : null}
    </div>
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
