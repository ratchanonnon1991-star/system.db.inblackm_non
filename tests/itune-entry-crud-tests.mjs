import { deleteItuneEntries, insertItuneEntry, saveItuneEntries, updateItuneEntry } from "@/server/itune-entries-repository.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));
const actor = { id: 7, username: "admin" };

reset();
setResponder((text) => {
  if (/INSERT INTO projectm_itune_entries/.test(text)) {
    return { rows: [{ id: 8, email: "created@example.com", password: "new-secret", amount: 100 }] };
  }
  if (/SELECT e\.\*,/.test(text)) {
    return { rows: [{ id: 8, email: "created@example.com", password: "new-secret", amount: 100 }] };
  }
  return null;
});

const createdEntry = await insertItuneEntry({ createdByUserId: actor.id, email: "created@example.com", password: "new-secret", amount: 100 }, actor);
const createAudit = log.find((item) => /INSERT INTO projectm_itune_entry_log/.test(item.text));
ok("create returns its inserted row without a post-commit read", createdEntry.id === 8 && !log.some((item) => /SELECT e\.\*,/.test(item.text)));
ok("create writes an audit row with its actor", createAudit?.params?.[2] === "create" && createAudit?.params?.[5] === actor.id);
ok("create audit redacts its password", JSON.parse(createAudit?.params?.[4] || "{}").password === "[redacted]");

reset();
setResponder((text) => {
  if (/SELECT \* FROM projectm_itune_entries WHERE id = \$1 FOR UPDATE/.test(text)) {
    return { rows: [{ id: 9, email: "old@example.com", password: "old-secret", amount: 100 }] };
  }
  if (/UPDATE projectm_itune_entries SET/.test(text) && /RETURNING \*/.test(text)) {
    return { rows: [{ id: 9, email: "new@example.com", password: "new-secret", amount: 100 }] };
  }
  if (/SELECT e\.\*,/.test(text)) {
    return { rows: [{ id: 9, email: "new@example.com", password: "new-secret", amount: 100 }] };
  }
  if (/SELECT id, username FROM gamedb_users/.test(text)) {
    return { rows: [{ id: actor.id, username: actor.username }] };
  }
  return null;
});

const updatedEntry = await updateItuneEntry(9, { email: "new@example.com", password: "new-secret" }, actor);
const updateAudit = log.find((item) => /INSERT INTO projectm_itune_entry_log/.test(item.text));
const oldValues = JSON.parse(updateAudit?.params?.[3] || "{}");
const newValues = JSON.parse(updateAudit?.params?.[4] || "{}");
ok("an update writes one audit row", Boolean(updateAudit));
ok("update returns its changed row without a post-commit read", updatedEntry.email === "new@example.com" && !log.some((item) => /SELECT e\.\*,/.test(item.text)));
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

reset();
setResponder((text) => {
  if (/FROM projectm_itune_entries WHERE id = ANY/.test(text)) {
    return {
      rows: [{ id: 11, email: "held@example.com", claimed_by_user_id: 22 }],
    };
  }
  return null;
});
let claimedDeleteError;
try {
  await deleteItuneEntries([11], actor);
} catch (error) {
  claimedDeleteError = error;
}
ok("deleting a claimed entry returns conflict", claimedDeleteError?.status === 409);
ok("a claimed entry is never deleted", !log.some((item) => /DELETE FROM projectm_itune_entries/.test(item.text)));
ok("a blocked delete rolls back its transaction", log.some((item) => item.text === "ROLLBACK"));

reset();
let inserts = 0;
setResponder((text) => {
  if (/INSERT INTO projectm_itune_entries/.test(text)) {
    inserts += 1;
    if (inserts === 2) throw Object.assign(new Error("duplicate Link_SMS"), { status: 409 });
    return { rows: [{ id: 1, email: "first@example.com", link_sms: "first-link" }] };
  }
  return null;
});
let bulkSaveError;
try {
  await saveItuneEntries({
    creates: [
      { clientId: "temp-1", fields: { email: "first@example.com", linkSms: "first-link" } },
      { clientId: "temp-2", fields: { email: "second@example.com", linkSms: "second-link" } },
    ],
    updates: [],
  }, actor);
} catch (error) {
  bulkSaveError = error;
}
ok("bulk save surfaces a row failure", bulkSaveError?.status === 409);
ok("bulk save rolls back every row when one write fails", log.some((item) => item.text === "ROLLBACK"));
ok("bulk save never commits partial success", !log.some((item) => item.text === "COMMIT"));

reset();
setResponder((text) => {
  if (/SELECT id, link_sms FROM projectm_itune_entries/.test(text)) return { rows: [] };
  if (/INSERT INTO projectm_itune_entries/.test(text)) {
    return {
      rows: [{
        id: 12,
        created_by_user_id: actor.id,
        email: "atomic@example.com",
        amount: 100,
        link_sms: "atomic-link",
      }],
    };
  }
  return null;
});
const bulkResult = await saveItuneEntries({
  creates: [{
    clientId: "temp-3",
    fields: { email: "atomic@example.com", amount: 100, linkSms: "atomic-link" },
  }],
  updates: [],
}, actor);
ok("bulk save returns the inserted row without a post-commit read", bulkResult.created[0]?.entry?.id === 12);
ok("bulk save does not query the created row after commit", !log.some((item) => /SELECT e\.\*,/.test(item.text)));
ok("admin saves use an advisory transaction lock", log.some((item) => /pg_advisory_xact_lock/.test(item.text)));
ok("bulk save no longer locks the whole entries table", !log.some((item) => /LOCK TABLE projectm_itune_entries/.test(item.text)));
ok("bulk save no longer selects every entry", !log.some((item) => /SELECT \* FROM projectm_itune_entries ORDER BY id/.test(item.text)));

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
