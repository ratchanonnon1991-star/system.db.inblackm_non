"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { normalizeSpaces } from "@/lib/text-normalize";

// Iterative Levenshtein (edit distance) — small, no need for a dependency
// for a "did you mean this?" nudge on a handful of candidate names.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

// Game-name field — same "click in, see every existing value, filter as you
// type" picklist behavior as GameinfoMemoryInput (see that component), plus
// the duplicate/typo checking this field always had on top of it: typing
// still checks the name against every *other* game's name and flags:
//  - an exact match (case/whitespace-insensitive) as a duplicate — reported
//    up via onDuplicateChange so the caller can block saving that row;
//  - close-but-not-exact matches (small edit distance — a likely typo) as a
//    "did you mean one of these?" nudge, informational only, never blocking.
export default function GameinfoNameInput({
  value,
  onChange,
  existingNames,
  onDuplicateChange,
  placeholder,
  className,
  id,
  autoFocus,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  // Same "show everything on focus, narrow to a substring match only once
  // they've actually typed" behavior as GameinfoMemoryInput — the field's
  // own current value shouldn't act as a filter query before the user has
  // typed anything new.
  const [hasTyped, setHasTyped] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current?.contains(e.target)) return;
      if (listRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    function updatePos() {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: r.width });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  const q = norm(value);
  const pool = existingNames || [];

  // Exact-match check is cheap (one pass, no distance math) — keep it always
  // live since onDuplicateChange needs it regardless of whether the dropdown
  // is even open.
  const hasDuplicate = useMemo(() => (q ? pool.some((n) => norm(n) === q) : false), [q, pool]);

  // The Levenshtein pass is the expensive part — O(pool size) edit-distance
  // computations. Was running on *every keystroke* unconditionally (even
  // while the dropdown was closed and nobody could see the result), which is
  // what made typing a game name visibly stutter once there were a couple
  // hundred other games to compare against. Memoized + skipped entirely
  // unless the dropdown is actually open.
  const similar = useMemo(() => {
    if (!open || q.length < 2) return [];
    return pool
      .map((n) => ({ name: n, dist: levenshtein(q, norm(n)) }))
      .filter(({ dist, name }) => dist > 0 && norm(name) !== q && dist <= Math.max(1, Math.round(q.length * 0.3)))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)
      .map((x) => x.name);
  }, [open, q, pool]);

  // Same picklist as GameinfoMemoryInput — every other game's name before
  // the user has typed anything, narrowed to a substring match once they
  // have, so an exact existing name can just be clicked instead of retyped.
  const browseList = useMemo(() => {
    const filtered = hasTyped ? pool.filter((n) => norm(n).includes(q) && norm(n) !== q) : pool;
    return filtered.slice(0, 50);
  }, [hasTyped, q, pool]);

  useEffect(() => {
    onDuplicateChange?.(hasDuplicate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDuplicate]);

  const showDropdown = open;

  return (
    <div className="relative" ref={ref}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHasTyped(true);
        }}
        onFocus={() => {
          setOpen(true);
          setHasTyped(false);
        }}
        onBlur={() => {
          const normalized = normalizeSpaces(value);
          if (normalized !== value) onChange(normalized);
        }}
        onClick={() => setOpen(true)}
        autoComplete="off"
        style={hasDuplicate ? { borderColor: "rgb(248 113 113 / 0.8)" } : undefined}
        className={
          className ??
          "w-full rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 py-2 text-sm outline-none focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
        }
      />
      {showDropdown &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={listRef}
            style={{ top: pos.top + 4, left: pos.left, width: Math.max(pos.width, 220) }}
            className="fixed z-50 max-h-56 overflow-auto rounded-md border border-linear-hairline bg-linear-surface-1 py-1 shadow-lg"
          >
            {hasDuplicate && (
              <div className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400">
                <AlertTriangle size={13} /> มีเกมชื่อนี้อยู่แล้วในระบบ
              </div>
            )}
            {similar.length > 0 && (
              <>
                <div className="px-3 py-1 text-[11px] text-linear-ink-tertiary">
                  ชื่อใกล้เคียง — พิมพ์ผิดรึเปล่า ใช่อันนี้ไหม?
                </div>
                {similar.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(s);
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-linear-ink hover:bg-linear-primary/10"
                  >
                    {s}
                  </button>
                ))}
              </>
            )}
            {browseList.length === 0 ? (
              <div className="px-3 py-1.5 text-sm text-linear-ink-tertiary">ไม่มีตัวเลือกที่ตรงกัน</div>
            ) : (
              browseList.map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(n);
                    setOpen(false);
                    setHasTyped(false);
                  }}
                  className="block w-full truncate px-3 py-1.5 text-left text-sm text-linear-ink hover:bg-linear-primary/10"
                >
                  {n}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
