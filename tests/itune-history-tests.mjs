import { clearItuneLogs, listItuneHistory } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";
import { readFileSync } from "node:fs";

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
        details: {
          amountUsed: 300,
          outcome: "partial_release",
          issueLogId: 12,
          rejectTimeline: [
            { action: "reject", actorUsername: "topup", occurredAt: "2026-08-20T07:00:00Z" },
            { action: "reject_confirm", actorUsername: "admin", occurredAt: "2026-08-20T08:00:00Z" },
          ],
        },
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

const history = await listItuneHistory({
  category: "claim",
  query: "mail",
  from: "2026-08-01",
  to: "2026-08-20",
  page: 2,
  pageSize: 25,
});
ok("unified history returns the total", history.total === 1);
ok("claim history exposes start and end balances", history.events[0].oldValues.startAmount === 500 && history.events[0].newValues.endAmount === 200);
ok("claim proof uses an authenticated endpoint", history.events[0].imageUrl === "/api/projectm/itune/claim-session/44/image");
ok("Reject history includes its linked timeline", history.events[0].details.rejectTimeline.length === 2 && history.events[0].details.issueLogId === 12);
ok("history filters and pagination are bound parameters", log.some((item) => /WITH history AS/.test(item.text) && item.params?.includes("claim") && item.params?.includes("%mail%") && item.params?.includes("2026-08-01") && item.params?.includes("2026-08-20") && item.params?.includes(25)));
ok("Reject timeline is assembled in the unified query", log.some((item) => /rejectTimeline/.test(item.text) && /timeline\.issue_log_id = i\.id/.test(item.text)));
ok("admin log is protected by an update/delete trigger", log.some((item) => /BEFORE UPDATE OR DELETE ON projectm_itune_admin_log/.test(item.text)));
const entryMigrationIndex = log.findIndex((item) => /ADD COLUMN IF NOT EXISTS changed_at/.test(item.text));
const entryIndexIndex = log.findIndex((item) => /projectm_itune_entry_log_entry_time_idx/.test(item.text));
ok("legacy entry log is migrated before its changed_at index", entryMigrationIndex >= 0 && entryMigrationIndex < entryIndexIndex);
ok("legacy entry audit data is preserved", log.some((item) =>
  /to_jsonb\(projectm_itune_entry_log\)->'changes'/.test(item.text) &&
  /->>'created_at'/.test(item.text) && /->>'user_id'/.test(item.text)
));
ok("legacy admin audit columns are migrated before immutability", log.some((item) =>
  /ADD COLUMN IF NOT EXISTS category TEXT/.test(item.text) &&
  /ADD COLUMN IF NOT EXISTS actor_user_id INTEGER/.test(item.text)
));

const tableSource = readFileSync(new URL("../src/components/itune-admin-table.js", import.meta.url), "utf8");
const historyRouteSource = readFileSync(new URL("../src/app/api/projectm/itune/history/route.js", import.meta.url), "utf8");
const oldTopupPageSource = readFileSync(new URL("../src/app/projectm/[lang]/itune/admin/topup-log/page.js", import.meta.url), "utf8");
ok("per-mail amount history deep-links with an encoded query", /history\?category=amount&q=\$\{encodeURIComponent\(row\.email/.test(tableSource));
ok("unified history API requires a projectm admin", /requireProjectmAdmin\(request\)/.test(historyRouteSource));
ok("old topup history URL redirects to claim history", /history\?category=claim/.test(oldTopupPageSource));

reset();
let missingReason;
try {
  await clearItuneLogs(actor, "");
} catch (error) {
  missingReason = error;
}
ok("clear history requires a reason before deleting", missingReason?.status === 400 && !log.some((item) => /^DELETE/.test(item.text)));

reset({ fail: "delete failed" });
try {
  await clearItuneLogs(actor, "test rollback");
} catch {}
ok("clear history rolls back a failed delete", log.some((item) => item.text === "ROLLBACK") && !log.some((item) => item.text === "COMMIT"));

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
