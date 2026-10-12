import {
  claimItuneEntry,
  listClaimableItuneEntriesForUser,
} from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));

const actor = { id: 7, username: "topup", projectmRole: "topup" };
let selectedQuery = null;

reset();
setResponder(async (text, params) => {
  if (/SELECT max_amount, claim_paused, priority_amount_threshold/.test(text)) {
    return {
      rows: [{
        max_amount: 0.99,
        claim_paused: false,
        priority_amount_threshold: 400,
        target_hours: 24,
        burn_rate_usd_per_hour: 50,
        expected_idle_hours: 6,
      }],
    };
  }
  if (/SELECT COUNT\(\*\)::int AS count/.test(text)) return { rows: [{ count: 0 }] };
  if (/FOR UPDATE SKIP LOCKED/.test(text)) {
    selectedQuery = { text, params };
    return {
      rows: [{ id: 205, email: "chosen@example.com", amount: 500, amount_confirm_image: null }],
    };
  }
  if (/SELECT e\.\*,/.test(text)) {
    return {
      rows: [{ id: 205, email: "chosen@example.com", amount: 500, claimed_by_user_id: 7 }],
    };
  }
  if (/SELECT id, username FROM gamedb_users/.test(text)) {
    return { rows: [{ id: 7, username: "topup" }] };
  }
  return null;
});

const claimed = await claimItuneEntry(actor, 205);
ok("the requested entry is returned", claimed.id === 205);
ok("the selected claim filters by entry id", /AND e\.id = \$7/.test(selectedQuery?.text || ""));
ok("the selected id is bound, not interpolated", selectedQuery?.params?.[6] === 205);
ok(
  "the selected row is assigned to the actor",
  log.some((entry) =>
    /SET claimed_by_user_id = \$1/.test(entry.text) &&
    entry.params?.[0] === actor.id &&
    entry.params?.[1] === 205
  )
);

let previewQuery = null;
reset();
setResponder(async (text, params) => {
  if (/SELECT e\.id, e\.email, e\.amount/.test(text)) {
    previewQuery = { text, params };
    return {
      rows: [{
        id: 301,
        email: "available@example.com",
        password: "must-not-leak",
        amount: "125.50",
        currency: "USD",
        supplier: "Apple",
        added_at: new Date("2026-10-12T00:00:00.000Z"),
      }],
    };
  }
  return null;
});

const available = await listClaimableItuneEntriesForUser(actor.id, {
  maxAmount: 0.99,
  targetHours: 24,
  burnRateUsdPerHour: 50,
  expectedIdleHours: 6,
});
ok("available entries are listed", available.length === 1 && available[0].id === 301);
ok("available entry amount is normalized", available[0].amount === 125.5);
ok("credentials are not exposed before claiming", !("password" in available[0]));
ok("the preview applies the user's reject exclusion", previewQuery?.params?.[5] === actor.id);
ok("held rows are excluded from the preview", /claim_hold = FALSE/.test(previewQuery?.text || ""));

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
