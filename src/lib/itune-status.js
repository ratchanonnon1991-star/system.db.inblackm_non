// Itune admin's "Status" column (see projectm.md col 8) is not stored — it's
// derived live from the row's Amount, on the raw currency value (not a
// ratio of some original amount). Boundaries per the confirmed spec:
//   amount <= 0.1        -> "ปล่อยได้"        (releasable — effectively drained)
//   0.1 < amount < 1.0    -> "ใช้งานเรียบร้อย"  (in use, below the full-unit mark)
//   amount >= 1.0         -> "ใช้งานได้"        (usable — at/above a full unit)
export function computeItuneStatus(amount) {
  const value = Number(amount) || 0;
  if (value <= 0.1) return { label: "ปล่อยได้", tone: "subtle" };
  if (value < 1) return { label: "ใช้งานเรียบร้อย", tone: "warning" };
  return { label: "ใช้งานได้", tone: "success" };
}
