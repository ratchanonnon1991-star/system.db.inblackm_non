"use client";

import { useEffect, useState } from "react";

// Read-only display for col 2 (Date_time): a 24h countdown from the moment
// the row was added, switching to an "over by" counter once it passes 24h
// and continuing to count up from there. `now` is handed down from the
// table's single shared ticker (see src/lib/itune-ticker.js) — this
// component owns no timer of its own.
const DAY_MS = 24 * 60 * 60 * 1000;

function formatHm(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

// `permanent` (row.isPermanent — see the "ตั้งเป็นเมลถาวร" row-menu action)
// drops the countdown entirely: just the date, in blue, never ticking.
// `frozen` (true once the entry's status is "ใช้หมดแล้ว" — see
// ITUNE_DEPLETED_STATUS) is the lighter-touch version — it still shows a
// countdown, just stops it at whatever it read the moment it became frozen
// instead of continuing to tick with `now`. Captured into state (refs can't
// be read/written during render) via an effect that only reacts to `frozen`/
// `permanent` flipping, not every `now` tick — deliberately outside
// exhaustive-deps for that reason.
export default function ItuneCountdownCell({ addedAt, now, frozen, permanent }) {
  const startMs = addedAt ? new Date(addedAt).getTime() : NaN;
  const liveElapsed = Number.isFinite(startMs) ? now - startMs : null;

  const [frozenElapsed, setFrozenElapsed] = useState(null);

  useEffect(() => {
    if (frozen && !permanent) {
      setFrozenElapsed((prev) => (prev === null ? liveElapsed : prev));
    } else {
      setFrozenElapsed(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to `frozen`/`permanent` flipping, not every `now` tick
  }, [frozen, permanent]);

  if (!addedAt || liveElapsed === null) return <span className="text-ll-ink-tertiary">-</span>;

  // Same th-TH date convention used elsewhere in the app (e.g.
  // query-panel.js, admin-modals.js) — the date it was added, with the
  // countdown alongside it in parentheses (except when permanent).
  const dateLabel = new Date(startMs).toLocaleDateString("th-TH");

  if (permanent) {
    return <span className="text-sky-500">{dateLabel}</span>;
  }

  const elapsed = frozen && frozenElapsed !== null ? frozenElapsed : liveElapsed;

  if (elapsed <= DAY_MS) {
    return (
      <span className="text-ll-ink">
        {dateLabel}{" "}
        <span className="text-ll-ink-subtle">({formatHm(DAY_MS - elapsed)} ชม.)</span>
      </span>
    );
  }

  return (
    <span className="text-ll-primary">
      {dateLabel}{" "}
      <span className="text-ll-ink-subtle">(+{formatHm(elapsed - DAY_MS)} ชม. เกิน 24 ชม.)</span>
    </span>
  );
}
