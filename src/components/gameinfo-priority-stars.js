"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { apiJson } from "@/lib/api-json";

const STAR_PATH = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

export const GAMEINFO_PRIORITY_LABELS = ["ไม่ได้ตั้ง", "ต่ำ", "กลาง", "สูง"];

function StarIcon({ filled, size }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d={STAR_PATH} />
    </svg>
  );
}

// 0–3 stars. Editors click a star to set it (the same star again clears it)
// and it saves straight away; everyone else sees the stars only.
export default function GameinfoPriorityStars({ gameId, value = 0, editable = false, size = 18, onSaved }) {
  const [priority, setPriority] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const label = `ความสำคัญ${GAMEINFO_PRIORITY_LABELS[priority]}${priority ? ` (${priority} ดาว)` : ""}`;

  if (!editable) {
    return (
      <span role="img" aria-label={label} title={label} className="flex gap-0.5 text-[#D90005]">
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= priority ? "" : "text-linear-hairline-strong"}><StarIcon filled={n <= priority} size={size} /></span>
        ))}
      </span>
    );
  }

  async function choose(n) {
    const next = n === priority ? 0 : n;
    const previous = priority;
    setPriority(next);
    setSaving(true);
    setError("");
    try {
      await apiJson(`/api/gameinfo/gamelist/${gameId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
        fallbackError: "บันทึกความสำคัญไม่สำเร็จ",
      });
      onSaved?.(next);
    } catch (saveError) {
      setPriority(previous);
      setError(saveError instanceof Error ? saveError.message : "บันทึกความสำคัญไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="flex items-center gap-1">
      <span role="group" aria-label="ความสำคัญ" className="flex">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            disabled={saving}
            onClick={() => choose(n)}
            aria-pressed={n <= priority}
            aria-label={n === priority ? `ล้างความสำคัญ (ตอนนี้ ${n} ดาว)` : `ตั้งความสำคัญ ${n} ดาว`}
            title={GAMEINFO_PRIORITY_LABELS[n]}
            className={`flex items-center justify-center rounded-lg transition hover:bg-[#D90005]/10 disabled:opacity-60 ${n <= priority ? "text-[#D90005]" : "text-linear-hairline-strong hover:text-[#D90005]/60"}`}
            style={{ width: size + 14, height: size + 14 }}
          >
            <StarIcon filled={n <= priority} size={size} />
          </button>
        ))}
      </span>
      {error ? <span role="alert" className="text-xs text-linear-danger">{error}</span> : null}
    </span>
  );
}

// Whether the game is on sale on the TopUp website. `web` is null when the
// game is not linked to a website game (or the website is not connected).
export function GameinfoWebBadge({ web, size = "md" }) {
  const small = size === "sm";
  const base = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[13px]"}`;
  if (!web) {
    return <span className={`${base} border border-dashed border-linear-hairline-strong text-linear-ink-tertiary`} title="ยังไม่ได้เชื่อมกับเกมบนเว็บ TopUp">ไม่ได้เชื่อมเว็บ</span>;
  }
  const modes = [web.uidEnabled ? "UID" : null, web.idpassEnabled ? "ID-PASS" : null].filter(Boolean).join(" + ");
  return (
    <span
      className={`${base} ${web.isActive ? "bg-sky-500/15 text-sky-800 dark:text-sky-300" : "bg-linear-surface-3 text-linear-ink-muted"}`}
      title={web.isActive ? `เปิดขายบนเว็บ${modes ? ` · ${modes}` : ""}` : "ปิดบนเว็บ"}
    >
      <Globe size={small ? 11 : 13} aria-hidden="true" />
      {web.isActive ? "Web ON" : "Web OFF"}
    </span>
  );
}
