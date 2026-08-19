export const DEFAULT_ITUNE_TARGET_HOURS = 24;
export const DEFAULT_ITUNE_BURN_RATE = 50;
export const DEFAULT_ITUNE_EXPECTED_IDLE_HOURS = 6;
export const DEFAULT_ITUNE_CLAIM_WARNING_HOURS = 32;

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function computeItuneQueueMetrics(entry, settings = {}, now = Date.now()) {
  const addedAt = new Date(entry?.addedAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const knownAgeHours =
    Number.isFinite(addedAt) && Number.isFinite(nowMs)
      ? Math.max(0, (nowMs - addedAt) / 3_600_000)
      : 0;
  const targetHours = Math.max(
    0,
    finiteOr(settings.targetHours, DEFAULT_ITUNE_TARGET_HOURS)
  );
  const burnRate = Math.max(
    0.01,
    finiteOr(settings.burnRateUsdPerHour, DEFAULT_ITUNE_BURN_RATE)
  );
  const expectedIdleHours = Math.max(
    0,
    finiteOr(settings.expectedIdleHours, DEFAULT_ITUNE_EXPECTED_IDLE_HOURS)
  );
  const amount = Math.max(0, finiteOr(entry?.amount, 0));
  const safeHoursLeft = targetHours - knownAgeHours;
  const estimatedActiveHours = amount / burnRate;
  const completionSlackHours = safeHoursLeft - estimatedActiveHours - expectedIdleHours;

  return {
    knownAgeHours,
    safeHoursLeft,
    estimatedActiveHours,
    expectedIdleHours,
    completionSlackHours,
    risk:
      knownAgeHours >= finiteOr(settings.claimWarningHours, DEFAULT_ITUNE_CLAIM_WARNING_HOURS)
        ? "claim"
        : knownAgeHours >= targetHours
          ? "overdue"
          : completionSlackHours < 0
            ? "risk"
            : completionSlackHours <= 6
              ? "urgent"
              : "normal",
  };
}

export function compareItuneQueueEntries(a, b, settings = {}, now = Date.now()) {
  const aPinned =
    a?.priorityOrder !== null &&
    a?.priorityOrder !== undefined &&
    Number.isFinite(Number(a.priorityOrder));
  const bPinned =
    b?.priorityOrder !== null &&
    b?.priorityOrder !== undefined &&
    Number.isFinite(Number(b.priorityOrder));
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  if (aPinned) {
    const pinOrder = Number(a.priorityOrder) - Number(b.priorityOrder);
    if (pinOrder) return pinOrder;
  }

  const aMetrics = computeItuneQueueMetrics(a, settings, now);
  const bMetrics = computeItuneQueueMetrics(b, settings, now);
  const bySlack = aMetrics.completionSlackHours - bMetrics.completionSlackHours;
  if (Math.abs(bySlack) > 0.000001) return bySlack;

  const byAmount = finiteOr(b?.amount, 0) - finiteOr(a?.amount, 0);
  if (byAmount) return byAmount;

  const byDate = new Date(a?.addedAt).getTime() - new Date(b?.addedAt).getTime();
  if (Number.isFinite(byDate) && byDate) return byDate;
  return finiteOr(a?.id, 0) - finiteOr(b?.id, 0);
}

export function classifyItuneBalance(amount, depletedThreshold = 0.99) {
  const value = Number(amount);
  const threshold = Number(depletedThreshold);
  if (!Number.isFinite(value) || value < 0) return "invalid";
  return value < (Number.isFinite(threshold) ? threshold : 0.99)
    ? "depleted"
    : "usable";
}
