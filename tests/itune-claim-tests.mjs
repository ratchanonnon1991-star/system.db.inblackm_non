import { claimItuneEntry } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));

reset();

let claimedCount = 1;
let claimUpdates = 0;
let lockTail = Promise.resolve();
const releases = new Map();

setResponder(async (text, params, { clientId }) => {
  if (/SELECT max_amount, claim_paused, priority_amount_threshold/.test(text)) {
    return {
      rows: [{ max_amount: 0.99, claim_paused: false, priority_amount_threshold: 400 }],
    };
  }
  if (/pg_advisory_xact_lock/.test(text)) {
    const previous = lockTail;
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    lockTail = previous.then(() => current);
    await previous;
    releases.set(clientId, release);
    return { rows: [{}] };
  }
  if (/SELECT COUNT\(\*\)::int AS count/.test(text)) {
    return { rows: [{ count: claimedCount }] };
  }
  if (/FOR UPDATE SKIP LOCKED/.test(text)) {
    return {
      rows: [{ id: 101, email: "one@example.com", amount: 500, amount_confirm_image: null }],
    };
  }
  if (/SET claimed_by_user_id = \$1, claimed_at = NOW\(\), priority_order = NULL/.test(text)) {
    claimedCount += 1;
    claimUpdates += 1;
    return { rows: [] };
  }
  if (/^\s*(COMMIT|ROLLBACK)/.test(text)) {
    releases.get(clientId)?.();
    releases.delete(clientId);
    return { rows: [] };
  }
  if (/SELECT e\.\*,/.test(text)) {
    return {
      rows: [{ id: 101, email: "one@example.com", amount: 500, claimed_by_user_id: 7 }],
    };
  }
  if (/SELECT id, username FROM gamedb_users/.test(text)) {
    return { rows: [{ id: 7, username: "topup" }] };
  }
  return null;
});

const actor = { id: 7, username: "topup", projectmRole: "topup" };
const results = await Promise.allSettled([
  claimItuneEntry(actor),
  claimItuneEntry(actor),
]);

ok(
  "only one concurrent claim succeeds when the user already holds one",
  results.filter((result) => result.status === "fulfilled").length === 1
);
ok(
  "the second concurrent claim is rejected by the two-claim cap",
  results.some((result) => result.status === "rejected" && result.reason?.status === 400)
);
ok("only one entry is assigned", claimUpdates === 1);

const lockIndex = log.findIndex((entry) => /pg_advisory_xact_lock/.test(entry.text));
const countIndex = log.findIndex((entry) => /SELECT COUNT\(\*\)::int AS count/.test(entry.text));
ok(
  "the per-user transaction lock is acquired before counting claims",
  lockIndex >= 0 && lockIndex < countIndex
);
ok(
  "the lock is scoped by namespace and actor id",
  log[lockIndex]?.params?.[1] === actor.id
);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
