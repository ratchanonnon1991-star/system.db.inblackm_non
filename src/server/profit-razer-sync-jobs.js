/**
 * Background Razer balance sync jobs.
 * Browser POSTs return immediately with a jobId; the UI polls until done.
 * Avoids reverse-proxy HTTP 504 while Playwright login takes 1–3 minutes.
 */

import { randomUUID } from "crypto";
import { syncAllRazerAccounts, syncRazerAccountById } from "@/server/profit-razer-sync";

const JOB_TTL_MS = 45 * 60 * 1000;
const jobs = new Map();
/** accountId → jobId while running */
const accountJobs = new Map();
/** zoneKey → jobId while running */
const allJobs = new Map();

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const ts = job.finishedAt || job.startedAt;
    if (now - ts > JOB_TTL_MS) {
      jobs.delete(id);
      if (job.kind === "one" && accountJobs.get(job.accountId) === id) accountJobs.delete(job.accountId);
      if (job.kind === "all" && allJobs.get(job.zoneKey) === id) allJobs.delete(job.zoneKey);
    }
  }
}

function publicJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    accountId: job.accountId || null,
    zone: job.zone || null,
    status: job.status,
    error: job.error || null,
    result: job.result || null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
  };
}

export function getRazerSyncJob(jobId) {
  pruneJobs();
  const job = jobs.get(String(jobId || ""));
  return job ? publicJob(job) : null;
}

export function startRazerAccountSyncJob(accountId) {
  pruneJobs();
  const idKey = String(accountId);
  const existingId = accountJobs.get(idKey);
  if (existingId) {
    const existing = jobs.get(existingId);
    if (existing && existing.status === "running") return publicJob(existing);
  }

  const id = randomUUID();
  const job = {
    id,
    kind: "one",
    accountId: idKey,
    status: "running",
    error: null,
    result: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(id, job);
  accountJobs.set(idKey, id);

  setImmediate(() => {
    syncRazerAccountById(idKey)
      .then((synced) => {
        job.status = "ok";
        job.result = {
          account: synced.account,
          goldBalance: synced.account?.goldBalance,
          silverBalance: synced.account?.silverBalance,
        };
        job.finishedAt = Date.now();
      })
      .catch((err) => {
        job.status = "error";
        job.error = err?.message || "ดึงยอด Razer ไม่สำเร็จ";
        job.finishedAt = Date.now();
      })
      .finally(() => {
        if (accountJobs.get(idKey) === id) accountJobs.delete(idKey);
      });
  });

  return publicJob(job);
}

export function startRazerSyncAllJob({ zone } = {}) {
  pruneJobs();
  const zoneKey = zone || "*";
  const existingId = allJobs.get(zoneKey);
  if (existingId) {
    const existing = jobs.get(existingId);
    if (existing && existing.status === "running") return publicJob(existing);
  }

  const id = randomUUID();
  const job = {
    id,
    kind: "all",
    zone: zone || null,
    zoneKey,
    status: "running",
    error: null,
    result: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(id, job);
  allJobs.set(zoneKey, id);

  setImmediate(() => {
    syncAllRazerAccounts({ zone: zone || undefined })
      .then((result) => {
        job.status = "ok";
        job.result = result;
        job.finishedAt = Date.now();
      })
      .catch((err) => {
        job.status = "error";
        job.error = err?.message || "ดึงยอดทั้งหมดไม่สำเร็จ";
        job.finishedAt = Date.now();
      })
      .finally(() => {
        if (allJobs.get(zoneKey) === id) allJobs.delete(zoneKey);
      });
  });

  return publicJob(job);
}
