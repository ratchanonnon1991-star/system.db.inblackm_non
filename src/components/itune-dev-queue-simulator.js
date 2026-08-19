"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  compareItuneQueueEntries,
  computeItuneQueueMetrics,
} from "@/lib/itune-queue";

const SUPPLIERS = ["Supplier A", "Supplier B", "Supplier C", "Supplier D"];
const SIMULATOR_OPENED_AT = Date.now();

const RISK_LABELS = {
  normal: ["ปกติ", "bg-ll-success-bg text-ll-success"],
  urgent: ["เร่ง", "bg-ll-warning-bg text-ll-warning"],
  risk: ["เสี่ยงไม่ทัน", "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"],
  overdue: ["เกิน 24 ชม.", "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"],
  claim: ["ตรวจ/เคลม", "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"],
};

function toLocalDateTimeInput(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function makeRows({ count, amountMin, amountMax, startAt, maxGapMinutes }) {
  const rows = [];
  let timestamp = new Date(startAt).getTime();
  const batchId = Math.random().toString(36).slice(2, 7);
  for (let i = 0; i < count; i += 1) {
    if (i > 0) timestamp += Math.floor(Math.random() * (maxGapMinutes + 1)) * 60_000;
    rows.push({
      id: i + 1,
      addedAt: new Date(timestamp).toISOString(),
      email: `queue-${batchId}-${String(i + 1).padStart(3, "0")}@example.test`,
      supplier: SUPPLIERS[Math.floor(Math.random() * SUPPLIERS.length)],
      amount: Math.round((amountMin + Math.random() * (amountMax - amountMin)) * 100) / 100,
      priorityOrder: null,
    });
  }
  return rows;
}

export default function ItuneDevQueueSimulator() {
  const [draft, setDraft] = useState({
    count: "20",
    amountMin: "200",
    amountMax: "500",
    targetHours: "24",
    burnRateUsdPerHour: "50",
    expectedIdleHours: "6",
    claimWarningHours: "32",
    startAt: toLocalDateTimeInput(new Date(SIMULATOR_OPENED_AT - 2 * 3_600_000)),
    maxGapMinutes: "5",
  });
  const [rows, setRows] = useState([]);
  const now = SIMULATOR_OPENED_AT;

  const config = Object.fromEntries(
    Object.entries(draft).map(([key, value]) =>
      key === "startAt" ? [key, value] : [key, Number(value)]
    )
  );
  const valid =
    Number.isInteger(config.count) &&
    config.count >= 1 &&
    config.count <= 500 &&
    config.amountMin >= 0 &&
    config.amountMax >= config.amountMin &&
    config.targetHours > 0 &&
    config.burnRateUsdPerHour > 0 &&
    config.expectedIdleHours >= 0 &&
    config.claimWarningHours >= config.targetHours &&
    Number.isInteger(config.maxGapMinutes) &&
    config.maxGapMinutes >= 0 &&
    !Number.isNaN(new Date(config.startAt).getTime());

  const orderedRows = [...rows].sort((a, b) =>
    compareItuneQueueEntries(a, b, config, now)
  );

  function set(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 shadow-[var(--ll-shadow-card)]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="จำนวน"><NumberInput value={draft.count} onChange={(v) => set("count", v)} min="1" max="500" step="1" /></Field>
          <Field label="Amount ต่ำสุด"><NumberInput value={draft.amountMin} onChange={(v) => set("amountMin", v)} min="0" step="0.01" /></Field>
          <Field label="Amount สูงสุด"><NumberInput value={draft.amountMax} onChange={(v) => set("amountMax", v)} min="0" step="0.01" /></Field>
          <Field label="เป้าหมาย (ชม.)"><NumberInput value={draft.targetHours} onChange={(v) => set("targetHours", v)} min="0.1" step="0.1" /></Field>
          <Field label="อัตราใช้ USD/ชม."><NumberInput value={draft.burnRateUsdPerHour} onChange={(v) => set("burnRateUsdPerHour", v)} min="0.01" step="1" /></Field>
          <Field label="เวลารอคนถัดไป (ชม.)"><NumberInput value={draft.expectedIdleHours} onChange={(v) => set("expectedIdleHours", v)} min="0" step="0.5" /></Field>
          <Field label="เตือนเคลม (ชม.)"><NumberInput value={draft.claimWarningHours} onChange={(v) => set("claimWarningHours", v)} min="0.1" step="0.5" /></Field>
          <Field label="วันและเวลาเริ่ม">
            <input type="datetime-local" value={draft.startAt} onChange={(e) => set("startAt", e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-[12px] text-ll-ink outline-none focus:border-ll-primary" />
          </Field>
          <Field label="ห่างสูงสุด (นาที)"><NumberInput value={draft.maxGapMinutes} onChange={(v) => set("maxGapMinutes", v)} min="0" max="1440" step="1" /></Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ll-hairline pt-4">
          <p className="text-[11px] text-ll-ink-subtle">
            สูตรเดียวกับ production: เวลาถึง 24 ชม. − เวลาที่คาดว่าจะใช้ − เวลารอ; slack น้อยขึ้นก่อน
          </p>
          <button type="button" onClick={() => {
            if (!valid) return;
            setRows(makeRows(config));
          }} disabled={!valid} className="flex h-10 items-center gap-2 rounded-lg bg-ll-emphasis-bg px-4 text-[13px] font-medium text-ll-emphasis-text disabled:opacity-40">
            <RefreshCw size={14} /> สุ่มและเรียงคิว
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-ll-hairline bg-ll-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-[12px]">
            <thead className="bg-ll-surface-2 text-ll-ink-subtle">
              <tr>
                <th className="px-3 py-2 text-center">คิว</th>
                <th className="px-3 py-2">ความเสี่ยง</th>
                <th className="px-3 py-2 text-right">Slack</th>
                <th className="px-3 py-2 text-right">อายุ</th>
                <th className="px-3 py-2">Date_time</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">เวลาที่คาดว่าใช้</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.length === 0 ? (
                <tr><td colSpan="9" className="px-4 py-12 text-center text-ll-ink-tertiary">ตั้งค่าแล้วกด “สุ่มและเรียงคิว”</td></tr>
              ) : orderedRows.map((row, index) => {
                const metrics = computeItuneQueueMetrics(row, config, now);
                const [riskLabel, riskClass] = RISK_LABELS[metrics.risk];
                return (
                  <tr key={row.id} className="border-t border-ll-hairline hover:bg-ll-surface-2/60">
                    <td className="px-3 py-2 text-center font-semibold text-ll-ink">{index + 1}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${riskClass}`}>{riskLabel}</span></td>
                    <td className="px-3 py-2 text-right font-mono text-ll-ink">{metrics.completionSlackHours.toFixed(1)} ชม.</td>
                    <td className="px-3 py-2 text-right text-ll-ink-subtle">{metrics.knownAgeHours.toFixed(1)} ชม.</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ll-ink-subtle">{new Date(row.addedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-3 py-2 text-ll-ink">{row.email}</td>
                    <td className="px-3 py-2 text-ll-ink-subtle">{row.supplier}</td>
                    <td className="px-3 py-2 text-right font-semibold text-ll-primary">{row.amount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-ll-ink-subtle">{metrics.estimatedActiveHours.toFixed(1)} ชม.</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block text-[11px] font-medium text-ll-ink-subtle">{label}{children}</label>;
}

function NumberInput({ value, onChange, ...props }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-[12px] text-ll-ink outline-none focus:border-ll-primary" {...props} />;
}
