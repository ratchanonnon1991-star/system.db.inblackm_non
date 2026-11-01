import { loadWorkforceData } from "./workforce-repository.js";
import { buildWorkforceReport, planningRange } from "./workforce-report.js";
import { bangkokWorkday } from "../lib/workforce-planning.js";

/** One workday's report. `date` and `channel` come from a request: both are checked before any database is read. */
export async function loadWorkforceReport({ date, channel }, now = new Date()) {
  const day = date || bangkokWorkday(now);
  const selected = channel || "all";
  const range = planningRange(day, now);
  buildWorkforceReport({ buckets: [], warnings: [], sources: [] }, { date: day, now, channel: selected });
  return buildWorkforceReport(await loadWorkforceData(range), { date: day, now, channel: selected });
}
