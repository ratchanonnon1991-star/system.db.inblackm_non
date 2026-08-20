import { deleteItuneEntries, updateItuneEntry } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));
const actor = { id: 7, username: "admin" };

reset();
setResponder((text) => {
  if (/SELECT \* FROM projectm_itune_entries WHERE id = \$1 FOR UPDATE/.test(text)) {
    return { rows: [{ id: 9, email: "old@example.com", password: "old-secret", amount: 100 }] };
  }
  if (/SELECT e\.\*,/.test(text)) {
    return { rows: [{ id: 9, email: "new@example.com", password: "new-secret", amount: 100 }] };
  }
  if (/SELECT id, username FROM gamedb_users/.test(text)) {
    return { rows: [{ id: actor.id, username: actor.username }] };
  }
  return null;
});

await updateItuneEntry(9, { email: "new@example.com", password: "new-secret" }, actor);
const updateAudit = log.find((item) => /INSERT INTO projectm_itune_entry_log/.test(item.text));
const oldValues = JSON.parse(updateAudit?.params?.[3] || "{}");
const newValues = JSON.parse(updateAudit?.params?.[4] || "{}");
ok("an update writes one audit row", Boolean(updateAudit));
ok("the audit records the actor", updateAudit?.params?.[5] === actor.id);
ok("the audit stores the old and new email", oldValues.email === "old@example.com" && newValues.email === "new@example.com");
ok("the audit never stores the password", oldValues.password === "[redacted]" && newValues.password === "[redacted]");
ok(
  "the update and audit share one transaction",
  log.some((item) => item.text === "BEGIN") && log.some((item) => item.text === "COMMIT")
);

reset();
setResponder((text) => {
  if (/FROM projectm_itune_entries WHERE id = ANY/.test(text)) {
    return {
      rows: [
        { id: 9, email: "nine@example.com", password: "nine-secret", amount: 50 },
        { id: 10, email: "ten@example.com", password: "ten-secret", amount: 60 },
      ],
    };
  }
  return null;
});

const deleted = await deleteItuneEntries([9, 10], actor);
const deleteAudits = log.filter((item) => /INSERT INTO projectm_itune_entry_log/.test(item.text));
ok("bulk delete reports the deleted count", deleted === 2);
ok("bulk delete audits every row", deleteAudits.length === 2);
ok("bulk delete is distinguished in history", deleteAudits.every((item) => item.params?.[2] === "bulk_delete"));
ok("bulk delete writes a permanent admin summary", log.some((item) => /INSERT INTO projectm_itune_admin_log/.test(item.text) && item.params?.[1] === "bulk_delete"));
ok("bulk delete uses one bound id array", log.some((item) => /DELETE FROM projectm_itune_entries/.test(item.text) && item.params?.[0]?.length === 2));

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
