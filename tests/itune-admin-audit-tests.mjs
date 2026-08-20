import {
  reorderItunePriority,
  saveItuneClaimSettings,
  setItuneClaimHold,
  setItuneEntryPermanent,
  setItunePriorityPinned,
} from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));
const actor = { id: 7, username: "admin" };

function audit(action) {
  return log.find((item) =>
    /INSERT INTO projectm_itune_admin_log/.test(item.text) && item.params?.[1] === action
  );
}

function checkAudit(action) {
  const row = audit(action);
  ok(`${action} records actor and old/new values atomically`,
    row?.params?.[7] === actor.id &&
    row.params?.[4] && row.params?.[5] &&
    log.some((item) => item.text === "BEGIN") &&
    log.some((item) => item.text === "COMMIT")
  );
}

reset();
setResponder((text) => /SELECT id, priority_order/.test(text)
  ? { rows: [{ id: 1, priority_order: 0 }, { id: 2, priority_order: 1 }] }
  : null);
await reorderItunePriority([2, 1], actor);
checkAudit("priority_reorder");
ok("admin audit timestamps are database-generated", log.some((item) =>
  /CREATE TABLE IF NOT EXISTS projectm_itune_admin_log/.test(item.text) &&
  /created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/.test(item.text)
));

for (const scenario of [
  { pinned: true, current: null, next: 3, action: "priority_pin" },
  { pinned: false, current: 3, next: null, action: "priority_unpin" },
]) {
  reset();
  setResponder((text) => {
    if (/SELECT id, email, priority_order/.test(text)) return { rows: [{ id: 9, email: "mail@example.com", priority_order: scenario.current }] };
    if (/RETURNING priority_order/.test(text)) return { rows: [{ priority_order: scenario.next }] };
    if (/SELECT e\.\*,/.test(text)) return { rows: [{ id: 9, email: "mail@example.com", priority_order: scenario.next }] };
    return null;
  });
  await setItunePriorityPinned(9, scenario.pinned, actor);
  checkAudit(scenario.action);
}

for (const scenario of [
  { hold: true, action: "claim_hold" },
  { hold: false, action: "claim_unhold" },
]) {
  reset();
  setResponder((text) => {
    if (/SELECT id, email, claim_hold/.test(text)) return { rows: [{ id: 9, email: "mail@example.com", claim_hold: !scenario.hold }] };
    if (/SELECT e\.\*,/.test(text)) return { rows: [{ id: 9, email: "mail@example.com", claim_hold: scenario.hold }] };
    return null;
  });
  await setItuneClaimHold(9, scenario.hold, actor);
  checkAudit(scenario.action);
}

for (const scenario of [
  { permanent: true, action: "permanent_enable" },
  { permanent: false, action: "permanent_disable" },
]) {
  reset();
  setResponder((text) => {
    if (/SELECT id, email, is_permanent/.test(text)) return { rows: [{ id: 9, email: "mail@example.com", is_permanent: !scenario.permanent }] };
    if (/SELECT e\.\*,/.test(text)) return { rows: [{ id: 9, email: "mail@example.com", is_permanent: scenario.permanent }] };
    return null;
  });
  await setItuneEntryPermanent(9, scenario.permanent, actor);
  checkAudit(scenario.action);
}

for (const scenario of [
  { currentPaused: false, fields: { claimPaused: true }, action: "claim_pause" },
  { currentPaused: true, fields: { claimPaused: false }, action: "claim_resume" },
  { currentPaused: false, fields: { targetHours: 36, burnRateUsdPerHour: 75 }, action: "settings_update" },
]) {
  reset();
  setResponder((text) => /FROM projectm_itune_release_settings WHERE id = 1 FOR UPDATE/.test(text)
    ? { rows: [{
        max_amount: 0.99,
        claim_paused: scenario.currentPaused,
        priority_amount_threshold: 500,
        target_hours: 24,
        burn_rate_usd_per_hour: 50,
        expected_idle_hours: 6,
        claim_warning_hours: 32,
      }] }
    : null);
  await saveItuneClaimSettings(scenario.fields, actor);
  checkAudit(scenario.action);
}

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
