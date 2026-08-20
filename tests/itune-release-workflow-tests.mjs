import { releaseItuneEntry } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));

reset();
const actor = { id: 7, username: "topup", projectmRole: null };

setResponder((text) => {
  if (/SELECT max_amount FROM projectm_itune_release_settings/.test(text)) {
    return { rows: [{ max_amount: 0.99 }] };
  }
  if (/SELECT claimed_by_user_id, claimed_at, active_claim_session_id/.test(text)) {
    return {
      rows: [{
        claimed_by_user_id: actor.id,
        claimed_at: new Date("2026-08-19T08:00:00Z"),
        active_claim_session_id: 44,
        amount: 500,
        amount_confirm_image: "old-proof",
        email: "one@example.com",
        password: "secret",
        currency: "USD",
        supplier: "supplier",
        link_sms: "sms",
        qna: "qna",
        status: null,
      }],
    };
  }
  if (/SELECT e\.\*,/.test(text)) {
    return {
      rows: [{
        id: 101,
        email: "one@example.com",
        amount: 200,
        amount_confirm_image: "new-proof",
        claimed_by_user_id: null,
      }],
    };
  }
  return null;
});

const entry = await releaseItuneEntry(
  101,
  actor,
  { outcome: "partial_release", amount: 200, image: "new-proof", note: "" }
);

ok("partial release clears the claimant", entry.claimedByUserId === null);
ok(
  "latest balance and proof are saved while clearing the claim",
  log.some((item) =>
    /SET amount = \$2/.test(item.text) &&
    /claimed_by_user_id = NULL/.test(item.text) &&
    item.params?.[1] === 200 &&
    item.params?.[2] === "new-proof"
  )
);
ok(
  "claim session closes with partial outcome",
  log.some((item) =>
    /UPDATE projectm_itune_claim_sessions/.test(item.text) &&
    item.params?.[2] === "partial_release" &&
    item.params?.[5] === 44
  )
);
ok(
  "return proof is appended to the amount audit log",
  log.some((item) =>
    /INSERT INTO projectm_itune_amount_log/.test(item.text) &&
    item.params?.[4] === "new-proof"
  )
);

reset();
setResponder((text) => {
  if (/SELECT max_amount FROM projectm_itune_release_settings/.test(text)) {
    return { rows: [{ max_amount: 0.99 }] };
  }
  if (/SELECT claimed_by_user_id, claimed_at, active_claim_session_id/.test(text)) {
    return {
      rows: [{
        claimed_by_user_id: actor.id,
        claimed_at: new Date(),
        active_claim_session_id: 45,
        amount: 10,
        email: "two@example.com",
      }],
    };
  }
  return null;
});

let mismatch;
try {
  await releaseItuneEntry(
    102,
    actor,
    { outcome: "depleted", amount: 0.99, image: "proof", note: "" }
  );
} catch (error) {
  mismatch = error;
}
ok("exactly 0.99 cannot be marked depleted", mismatch?.status === 400);
ok("threshold warning says the mail is still usable", mismatch?.message?.includes("ยังใช้ต่อได้"));
ok(
  "invalid depleted outcome does not update the entry",
  !log.some((item) => /SET amount = \$2/.test(item.text))
);

for (const scenario of [
  { id: 103, outcome: "depleted", amount: 0.5, note: "" },
  { id: 104, outcome: "unusable", amount: 5, note: "เข้าใช้งานไม่ได้" },
]) {
  reset();
  setResponder((text) => {
    if (/SELECT max_amount FROM projectm_itune_release_settings/.test(text)) {
      return { rows: [{ max_amount: 0.99 }] };
    }
    if (/SELECT claimed_by_user_id, claimed_at, active_claim_session_id/.test(text)) {
      return { rows: [{
        claimed_by_user_id: actor.id,
        claimed_at: new Date("2026-08-19T08:00:00Z"),
        active_claim_session_id: scenario.id,
        amount: 10,
        email: `${scenario.outcome}@example.com`,
      }] };
    }
    if (/SELECT e\.\*,/.test(text)) {
      return { rows: [{ id: scenario.id, email: `${scenario.outcome}@example.com`, amount: scenario.amount }] };
    }
    return null;
  });

  await releaseItuneEntry(scenario.id, actor, {
    outcome: scenario.outcome,
    amount: scenario.amount,
    image: `${scenario.outcome}-proof`,
    note: scenario.note,
  });
  ok(`${scenario.outcome} records outcome and proof`, log.some((item) =>
    /UPDATE projectm_itune_claim_sessions/.test(item.text) &&
    item.params?.[2] === scenario.outcome &&
    item.params?.[3] === `${scenario.outcome}-proof`
  ));
}

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
