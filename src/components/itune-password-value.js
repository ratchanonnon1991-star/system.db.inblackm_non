"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function ItunePasswordInput({ value, onChange, onEnter, className = "" }) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onEnter?.();
        }}
        autoFocus
        autoComplete="new-password"
        className={`${className} pr-8`}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-3 hover:text-ll-ink"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  );
}

export default function ItunePasswordValue({ value, className = "" }) {
  const [visible, setVisible] = useState(false);
  const password = String(value || "");

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span className="truncate">{password ? (visible ? password : "••••••••") : "—"}</span>
      {password && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setVisible((current) => !current);
          }}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-3 hover:text-ll-ink"
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </span>
  );
}
