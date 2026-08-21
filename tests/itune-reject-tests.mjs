import { confirmItuneReject } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));

reset();

const rejecterId = 7;
const currentClaimantId = 8;

setResponder((text) => {
  if (/SELECT entry_id, entry_email, action, issue_log_id/.test(text)) {
    return {
      rows: [{
        entry_id: 101,
        entry_email: "one@example.com",
        action: "reject",
        issue_log_id: 55,
      }],
    };
  }
  if (/FROM projectm_itune_issue_log WHERE id = \$1 FOR UPDATE/.test(text)) {
    return {
      rows: [{
        id: 55,
        entry_id: 101,
        is_reject: true,
        reject_confirmed_at: null,
        reported_by_user_id: rejecterId,
      }],
    };
  }
  if (/SELECT e\.\*,/.test(text)) {
    return {
      rows: [{
        id: 101,
        email: "one@example.com",
        amount: 500,
        claimed_by_user_id: currentClaimantId,
      }],
    };
  }
  if (/SELECT id, username FROM gamedb_users/.test(text)) {
    return { rows: [{ id: currentClaimantId, username: "new-holder" }] };
  }
  return null;
});

const entry = await confirmItuneReject(12, {
  id: 1,
  username: "admin",
  projectmRole: "admin",
});

const release = log.find((item) =>
  /SET claimed_by_user_id = NULL, claimed_at = NULL/.test(item.text)
);

ok(
  "reject confirmation only releases the original rejecter's claim",
  /claimed_by_user_id = \$2/.test(release?.text || "")
);
ok(
  "the conditional release binds the rejecter's user id",
  release?.params?.[0] === 101 && release?.params?.[1] === rejecterId
);
ok(
  "a different current claimant remains assigned after confirmation",
  entry.claimedByUserId === currentClaimantId
);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
