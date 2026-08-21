import {
  classifyItuneBalance,
  compareItuneQueueEntries,
  computeItuneQueueMetrics,
} from "@/lib/itune-queue.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));
const close = (a, b) => Math.abs(a - b) < 0.0001;

const now = new Date("2026-08-19T12:00:00.000Z").getTime();
const settings = {
  targetHours: 24,
  burnRateUsdPerHour: 50,
  expectedIdleHours: 6,
  claimWarningHours: 32,
};

const metrics = computeItuneQueueMetrics(
  { addedAt: "2026-08-19T10:00:00.000Z", amount: 500 },
  settings,
  now
);
ok("known age is calculated", close(metrics.knownAgeHours, 2));
ok("active time uses amount and burn rate", close(metrics.estimatedActiveHours, 10));
ok("completion slack includes target, active and idle time", close(metrics.completionSlackHours, 6));
ok("six hours of slack is urgent", metrics.risk === "urgent");

ok("amount below 0.99 is depleted", classifyItuneBalance(0.98, 0.99) === "depleted");
ok("amount exactly 0.99 remains usable", classifyItuneBalance(0.99, 0.99) === "usable");
ok("amount above 0.99 remains usable", classifyItuneBalance(1, 0.99) === "usable");

const rows = [
  { id: 1, addedAt: "2026-08-19T10:00:00.000Z", amount: 200, priorityOrder: null },
  { id: 2, addedAt: "2026-08-19T11:00:00.000Z", amount: 500, priorityOrder: null },
  { id: 3, addedAt: "2026-08-19T11:30:00.000Z", amount: 100, priorityOrder: 1 },
];
const ordered = [...rows].sort((a, b) => compareItuneQueueEntries(a, b, settings, now));
ok("manual pin stays first", ordered[0].id === 3);
ok("automatic queue prioritizes least completion slack", ordered[1].id === 2);

const claimRisk = computeItuneQueueMetrics(
  { addedAt: "2026-08-18T03:00:00.000Z", amount: 1 },
  settings,
  now
);
ok("age at claim boundary is claim risk", claimRisk.risk === "claim");

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
