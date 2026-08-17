"use client";

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

export default function ItuneCountdownCell({ addedAt, now }) {
  if (!addedAt) return <span className="text-ll-ink-tertiary">-</span>;

  const startMs = new Date(addedAt).getTime();
  if (!Number.isFinite(startMs)) return <span className="text-ll-ink-tertiary">-</span>;

  // Same th-TH date convention used elsewhere in the app (e.g.
  // query-panel.js, admin-modals.js) — the date it was added, with the
  // countdown alongside it in parentheses.
  const dateLabel = new Date(startMs).toLocaleDateString("th-TH");
  const elapsed = now - startMs;

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
