"use client";

export default function GameinfoFormulaModeToggle({ mode, onChange, disabled = false }) {
  return (
    <div
      className={`inline-flex rounded-md border border-linear-hairline-strong bg-linear-surface-1 p-0.5 ${
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
          className={`rounded px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
            mode === value
              ? "bg-linear-primary text-white"
              : "text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
