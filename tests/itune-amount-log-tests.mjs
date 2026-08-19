import { listItuneAmountLog } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));

const user = { id: 7, username: "topup", projectmRole: null };
const admin = { id: 1, username: "admin", projectmRole: "admin" };

reset();
setResponder((text) => {
  if (/SELECT 1 FROM projectm_itune_entries/.test(text)) return { rows: [] };
  return null;
});

let denied;
try {
  await listItuneAmountLog(101, user);
} catch (error) {
  denied = error;
}
ok("a non-owner is denied", denied?.status === 403);
ok(
  "a denied request never reads amount history",
  !log.some((item) => /FROM projectm_itune_amount_log/.test(item.text))
);

reset();
setResponder((text) => {
  if (/SELECT 1 FROM projectm_itune_entries/.test(text)) return { rows: [{}] };
  if (/FROM projectm_itune_amount_log/.test(text)) {
    return {
      rows: [{
        id: 1,
        entry_id: 101,
        old_amount: 500,
        new_amount: 400,
        image: null,
        changed_by_user_id: user.id,
        changed_by_username: user.username,
        changed_at: new Date("2026-01-01T00:00:00.000Z"),
      }],
    };
  }
  return null;
});

const ownerLogs = await listItuneAmountLog(101, user);
ok("the current claimant can read amount history", ownerLogs.length === 1);
ok("amount history is mapped for the owner", ownerLogs[0].newAmount === 400);

reset();
setResponder((text) => {
  if (/FROM projectm_itune_amount_log/.test(text)) return { rows: [] };
  return null;
});

await listItuneAmountLog(101, admin);
ok(
  "a Projectm admin bypasses the claimant ownership query",
  !log.some((item) => /SELECT 1 FROM projectm_itune_entries/.test(item.text))
);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
