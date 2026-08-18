// Exported so callers that need to check for this specific tier (e.g.
// ItuneCountdownCell freezing once an entry is depleted) don't duplicate the
// literal string.
export const ITUNE_DEPLETED_STATUS = "ใช้หมดแล้ว";

// Itune admin's "Status" column (see projectm.md col 8) is derived live from
// the row's Amount, on the raw currency value (not a ratio of some original
// amount). Fixed thresholds — not admin-configurable (a configurable
// version with per-status colors/ranges and role-gated claiming was tried
// and then deliberately removed; keep this simple unless asked again). Just
// 2 tiers — a middle "เคลียร์เศษ" tier used to sit between these but was
// removed, merged into ITUNE_DEPLETED_STATUS.
export function computeItuneStatus(amount) {
  const value = Number(amount) || 0;
  if (value < 1.0) return { label: ITUNE_DEPLETED_STATUS, tone: "subtle", allowClaim: true };
  return { label: "ใช้ได้", tone: "success", allowClaim: true };
}

// Default "คืนเมล" (release) threshold — a topup user may only release their
// own claim once its Amount has dropped strictly below this value (see
// getItuneReleaseThreshold/releaseItuneEntry in itune-entries-repository.js
// and the settings modal in itune-admin-table.js). Admin-configurable via
// projectm_itune_release_settings — this is just the fallback if that table
// is ever empty.
export const DEFAULT_ITUNE_RELEASE_THRESHOLD = 0.99;

// Amount at or above which an unpinned entry sorts into the "ด่วน" tier,
// ahead of the ordinary oldest-first queue (see claimItuneEntry's ORDER BY
// and the admin "จัดคิวรับเมล" page). Admin-configurable on the same
// projectm_itune_release_settings singleton via the threshold box on that
// page — this is only the fallback before anything has been saved. Raise
// it if too many entries qualify: once most of the queue is "ด่วน" the
// low-amount entries at the back stop getting handed out at all, which is
// exactly what the tier is meant to avoid.
export const DEFAULT_ITUNE_PRIORITY_AMOUNT_THRESHOLD = 400;

// Set by the "แจ้งปัญหา" (report issue) action — persisted in the row's own
// `status` column, so it overrides the amount-derived status above until
// someone clears it. Kept as an exact string match (not just "truthy status")
// so any future reuse of that column for something else doesn't accidentally
// read as "unavailable".
export const ITUNE_UNAVAILABLE_STATUS = "ไม่พร้อมใช้งาน";

export function computeEffectiveItuneStatus(row) {
  if (row?.status === ITUNE_UNAVAILABLE_STATUS) {
    return { label: ITUNE_UNAVAILABLE_STATUS, tone: "danger", allowClaim: false };
  }
  return computeItuneStatus(row?.amount);
}
