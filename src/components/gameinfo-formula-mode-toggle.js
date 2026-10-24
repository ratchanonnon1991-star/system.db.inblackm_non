"use client";

export default function GameinfoFormulaModeToggle({ mode, onChange, disabled = false }) {
  return (
    <div
      className={`inline-flex gap-1 rounded-full bg-linear-surface-3 p-1 ${
        disabled ? "opacity-50" : ""
      }`}
      role="group"
      aria-label="รูปแบบการแสดงคอลัมน์สูตร"
    >
      {[
        ["result", "ผลลัพธ์"],
        ["formula", "สูตร"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={`h-8 rounded-full px-3.5 text-xs font-extrabold transition-colors disabled:cursor-not-allowed ${
            mode === value
              ? "bg-linear-surface-1 text-linear-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
              : "text-linear-ink-muted hover:text-linear-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
