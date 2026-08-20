import { clearItuneLogs, listItuneHistory } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));
const actor = { id: 7, username: "admin" };

reset();
setResponder((text) => {
  if (/WITH history AS/.test(text)) {
    return {
      rows: [{
        source_key: "claim-session-release-44",
        category: "claim",
        action: "release",
        entry_id: 9,
        entry_email: "mail@example.com",
        actor_user_id: 5,
        actor_username: "topup",
        occurred_at: new Date("2026-08-20T08:00:00Z"),
        old_values: { startAmount: 500 },
        new_values: { endAmount: 200 },
        details: { amountUsed: 300, outcome: "partial_release" },
        claim_log_id: null,
        can_confirm: false,
        can_decline: false,
        can_cancel: false,
        has_image: true,
        image_kind: "claim-session",
        image_id: 44,
        total_count: "1",
      }],
    };
  }
  return null;
});

const history = await listItuneHistory({ category: "claim", query: "mail", page: 1 });
ok("unified history returns the total", history.total === 1);
ok("claim history exposes start and end balances", history.events[0].oldValues.startAmount === 500 && history.events[0].newValues.endAmount === 200);
ok("claim proof uses an authenticated endpoint", history.events[0].imageUrl === "/api/projectm/itune/claim-session/44/image");
ok("history filters are bound parameters", log.some((item) => /WITH history AS/.test(item.text) && item.params?.includes("claim") && item.params?.includes("%mail%")));

reset({ rows: [{ placeholder: true }] });
await clearItuneLogs(actor, "reset test data");
const deletes = log.filter((item) => /^DELETE FROM projectm_itune_/.test(item.text));
const clearAudit = log.find((item) => /INSERT INTO projectm_itune_admin_log/.test(item.text));
ok("clear history removes every operational log", deletes.length === 5);
ok("clear history preserves active claim and Reject workflows", deletes.some((item) => /released_at IS NOT NULL/.test(item.text)) && deletes.some((item) => /i\.is_reject = TRUE/.test(item.text)));
ok("clear history does not delete the immutable admin log", !deletes.some((item) => /admin_log/.test(item.text)));
ok("clear history records actor and reason", clearAudit?.params?.[7] === actor.id && JSON.parse(clearAudit?.params?.[6] || "{}").reason === "reset test data");
ok("clear history is atomic", log.some((item) => item.text === "BEGIN") && log.some((item) => item.text === "COMMIT"));

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
