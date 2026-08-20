// projectm_itune_entries lives in the "topup_inblackm" external connection
// (same pattern gameinfo-gamelist.js uses for its own "gameinfo" connection)
// rather than this app's own primary pool. Because that's a separate
// database, created_by_user_id can't carry a real FK to gamedb_users (cross-
// database foreign keys aren't possible in Postgres) — it's a plain integer,
// and usernames are resolved with a second lookup against the primary pool
// instead of a JOIN.
import { getPool, getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";
import {
  DEFAULT_ITUNE_PRIORITY_AMOUNT_THRESHOLD,
  DEFAULT_ITUNE_RELEASE_THRESHOLD,
  ITUNE_UNAVAILABLE_STATUS,
} from "@/lib/itune-status";
import {
  DEFAULT_ITUNE_BURN_RATE,
  DEFAULT_ITUNE_CLAIM_WARNING_HOURS,
  DEFAULT_ITUNE_EXPECTED_IDLE_HOURS,
  DEFAULT_ITUNE_TARGET_HOURS,
} from "@/lib/itune-queue";
import { publishItuneQueueChanged } from "@/server/itune-queue-events";

const CONNECTION_NAME = "topup_inblackm";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Shared by claimItuneEntry/releaseItuneEntry/rejectItuneEntry/
// cancelItuneReject — see projectm_itune_claim_log's schema comment for why
// this exists alongside the entry's own claimed_by_user_id/claimed_at (this
// is the only place past claims/releases/rejects are remembered at all).
// issueLogId is only set for a 'reject' row — it's how the topup-log page's
// "ยกเลิก" button (see cancelItuneReject) finds the matching
// projectm_itune_issue_log row to undo without any fragile timestamp
// matching.
async function insertClaimLog(client, { entryId, entryEmail, action, actor, issueLogId = null }) {
  await client.query(
    `INSERT INTO projectm_itune_claim_log (entry_id, entry_email, action, user_id, username, issue_log_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entryId,
      entryEmail || null,
      action,
      actor?.id ?? null,
      actor?.displayName || actor?.username || null,
      issueLogId,
    ]
  );
}

async function getItuneConnection() {
  const connections = await listConnections();
  const match = connections.find((c) => c.name.trim().toLowerCase() === CONNECTION_NAME);
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

// Columns a client is ever allowed to write. id/added_at/created_by_user_id
// are server-stamped at insert time. status/support/other_notes/amount_out
// columns still exist in the table (dropping them is a destructive migration
// this app avoids without an explicit ask) but are no longer surfaced
// anywhere in the app — removed from the editable set on purpose.
const EDITABLE_FIELDS = [
  "email",
  "password",
  "currency",
  "supplier",
  "amount",
  "amountConfirmImage",
  "linkSms",
  "qna",
];

const FIELD_COLUMNS = {
  email: "email",
  password: "password",
  currency: "currency",
  supplier: "supplier",
  amount: "amount",
  amountConfirmImage: "amount_confirm_image",
  linkSms: "link_sms",
  qna: "qna",
};

function auditValue(key, value) {
  if (key === "password") return value ? "[redacted]" : "";
  if (key === "amountConfirmImage") return value ? "[image]" : "";
  return value ?? "";
}

function valuesMatch(key, before, after) {
  if (key === "amount") return Number(before || 0) === Number(after || 0);
  return String(before ?? "") === String(after ?? "");
}

function entryAuditValues(row, fields = null) {
  const values = {};
  for (const key of EDITABLE_FIELDS) {
    if (fields && fields[key] === undefined) continue;
    const value = fields ? fields[key] : row[FIELD_COLUMNS[key]];
    values[key] = auditValue(key, value);
  }
  return values;
}

async function insertEntryLog(client, { row, action, actor, oldValues = null, newValues = null }) {
  await client.query(
    `INSERT INTO projectm_itune_entry_log
       (entry_id, entry_email, action, old_values, new_values,
        changed_by_user_id, changed_by_username)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
    [
      row.id,
      row.email || null,
      action,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      actor?.id ?? null,
      actor?.displayName || actor?.username || null,
    ]
  );
}

async function insertAdminLog(client, {
  category,
  action,
  actor,
  entryId = null,
  entryEmail = null,
  oldValues = null,
  newValues = null,
  details = {},
}) {
  await client.query(
    `INSERT INTO projectm_itune_admin_log
       (category, action, entry_id, entry_email, old_values, new_values, details,
        actor_user_id, actor_username)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      category,
      action,
      entryId,
      entryEmail,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      JSON.stringify(details),
      actor?.id ?? null,
      actor?.displayName || actor?.username || null,
    ]
  );
}

// pg returns TIMESTAMPTZ columns as JS Date objects; added_at is passed
// through as an ISO string for the countdown cell.
function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRow(row, usernamesById = {}) {
  if (!row) return null;
  return {
    id: row.id,
    addedAt: toIsoString(row.added_at),
    email: row.email || "",
    password: row.password || "",
    createdByUserId: row.created_by_user_id || null,
    createdByUsername: row.created_by_user_id
      ? usernamesById[row.created_by_user_id] || null
      : null,
    currency: row.currency || "",
    supplier: row.supplier || "",
    amount: row.amount === null ? 0 : Number(row.amount),
    amountConfirmImage: row.amount_confirm_image || "",
    linkSms: row.link_sms || "",
    qna: row.qna || "",
    // status/otherNotes: unused by the editable form (see EDITABLE_FIELDS
    // comment above), but repurposed by the "แจ้งปัญหา" report action —
    // status holds the ITUNE_UNAVAILABLE_STATUS override, otherNotes the
    // reported issue text.
    status: row.status || "",
    otherNotes: row.other_notes || "",
    // Topup "รับเมล" self-service claim (see claimItuneEntry) — a row held
    // by claimedByUserId counts against that user's 2-claim cap and is
    // excluded from the claimable pool for everyone else until released
    // (see releaseItuneEntry). Independent of createdByUserId (who the
    // admin was that originally entered the row).
    claimedByUserId: row.claimed_by_user_id || null,
    claimedByUsername: row.claimed_by_user_id
      ? usernamesById[row.claimed_by_user_id] || null
      : null,
    claimedAt: toIsoString(row.claimed_at),
    // "ตั้งเป็นเมลถาวร" (see setItuneEntryPermanent/RowActionsMenu) —
    // exempts this row's countdown from counting at all, same as a
    // depleted row but as a standing admin override instead of a
    // status derived from Amount (see ItuneCountdownCell's `frozen` prop).
    isPermanent: row.is_permanent || false,
    // True while a "Reject" request on this entry is still awaiting admin
    // confirmation (see rejectItuneEntry/confirmItuneReject/
    // declineItuneReject) — only present when the query that produced this
    // row actually selected HAS_PENDING_REJECT_SQL; otherwise defaults to
    // false, which is the safe reading for callers that don't need it.
    hasPendingReject: row.has_pending_reject || false,
    // Claim-queue controls (see the admin "จัดคิวรับเมล" page). Only the
    // queries that actually select these columns carry real values;
    // everywhere else they read as "unpinned, not held", which is the
    // correct default for a caller that doesn't care.
    priorityOrder: row.priority_order === null || row.priority_order === undefined
      ? null
      : Number(row.priority_order),
    claimHold: row.claim_hold || false,
    activeClaimSessionId: row.active_claim_session_id ? Number(row.active_claim_session_id) : null,
    knownAgeHours:
      row.known_age_hours === null || row.known_age_hours === undefined
        ? null
        : Number(row.known_age_hours),
    completionSlackHours:
      row.completion_slack_hours === null || row.completion_slack_hours === undefined
        ? null
        : Number(row.completion_slack_hours),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

// Reusable scalar subquery for "does this entry currently have an
// unconfirmed Reject request" — opt into it per-query (see
// findItuneEntryById/listClaimedItuneEntriesForUser) by aliasing the
// entries table `e` and selecting this alongside `e.*`.
const HAS_PENDING_REJECT_SQL = `EXISTS (
  SELECT 1 FROM projectm_itune_issue_log l
  WHERE l.entry_id = e.id AND l.is_reject AND l.reject_confirmed_at IS NULL
) AS has_pending_reject`;

// Least-completion-slack is shared by the claim transaction and preview.
const COMPLETION_SLACK_SQL = `(
  EXTRACT(EPOCH FROM ((added_at + ($3 * INTERVAL '1 hour')) - NOW())) / 3600
  - (amount / NULLIF($4, 0))
  - $5
)`;

const CLAIM_ORDER_SQL = `ORDER BY
  (priority_order IS NULL),
  priority_order ASC NULLS LAST,
  ${COMPLETION_SLACK_SQL} ASC,
  amount DESC,
  added_at ASC,
  id ASC`;

// Exactly at the depleted threshold remains usable.
const CLAIMABLE_WHERE_SQL = `claimed_by_user_id IS NULL
     AND (status IS NULL OR status <> $1)
     AND amount >= $2`;

// Resolves { userId: username } for whichever creators showed up in a batch
// of rows — a plain lookup against the primary pool since it can't be a JOIN
// across the two separate databases.
async function fetchUsernamesById(userIds) {
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return {};
  const result = await getPool().query(
    `SELECT id, username FROM gamedb_users WHERE id = ANY($1)`,
    [ids]
  );
  return Object.fromEntries(result.rows.map((r) => [r.id, r.username]));
}

const schemaReadyByConnection = new Map();

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_entries (
          id                   SERIAL PRIMARY KEY,
          added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sms_expiry           DATE NOT NULL DEFAULT CURRENT_DATE,
          status               TEXT,
          support              TEXT,
          email                TEXT,
          password             TEXT,
          created_by_user_id   INTEGER,
          currency             TEXT,
          supplier             TEXT,
          amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
          amount_confirm_image TEXT,
          amount_out           NUMERIC(14,2) NOT NULL DEFAULT 0,
          link_sms             TEXT,
          qna                  TEXT,
          other_notes          TEXT,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Added after the table already existed — safe to re-run, same
      // convention as gamedb_user_preferences in users-repository.js.
      await client.query(`
        ALTER TABLE projectm_itune_entries
        ADD COLUMN IF NOT EXISTS supplier TEXT
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_entry_log (
          id                    BIGSERIAL PRIMARY KEY,
          entry_id              INTEGER NOT NULL,
          entry_email           TEXT,
          action                TEXT NOT NULL
                                CHECK (action IN ('create', 'update', 'delete', 'bulk_delete')),
          old_values            JSONB,
          new_values            JSONB,
          changed_by_user_id    INTEGER,
          changed_by_username   TEXT,
          changed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        ALTER TABLE projectm_itune_entry_log
        ADD COLUMN IF NOT EXISTS old_values JSONB,
        ADD COLUMN IF NOT EXISTS new_values JSONB,
        ADD COLUMN IF NOT EXISTS changed_by_user_id INTEGER,
        ADD COLUMN IF NOT EXISTS changed_by_username TEXT,
        ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ
      `);
      await client.query(`
        UPDATE projectm_itune_entry_log
        SET old_values = COALESCE(old_values, CASE WHEN action IN ('delete', 'bulk_delete')
              THEN to_jsonb(projectm_itune_entry_log)->'changes' END),
            new_values = COALESCE(new_values, CASE WHEN action NOT IN ('delete', 'bulk_delete')
              THEN to_jsonb(projectm_itune_entry_log)->'changes' END),
            changed_by_user_id = COALESCE(changed_by_user_id,
              NULLIF(to_jsonb(projectm_itune_entry_log)->>'user_id', '')::INTEGER),
            changed_by_username = COALESCE(changed_by_username,
              to_jsonb(projectm_itune_entry_log)->>'username'),
            changed_at = COALESCE(changed_at,
              NULLIF(to_jsonb(projectm_itune_entry_log)->>'created_at', '')::TIMESTAMPTZ,
              NOW())
        WHERE changed_at IS NULL
      `);
      await client.query(`
        ALTER TABLE projectm_itune_entry_log
        ALTER COLUMN changed_at SET DEFAULT NOW(),
        ALTER COLUMN changed_at SET NOT NULL,
        DROP CONSTRAINT IF EXISTS projectm_itune_entry_log_action_check
      `);
      await client.query(`
        ALTER TABLE projectm_itune_entry_log
        ADD CONSTRAINT projectm_itune_entry_log_action_check
        CHECK (action IN ('create', 'update', 'delete', 'bulk_delete'))
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS projectm_itune_entry_log_entry_time_idx
        ON projectm_itune_entry_log (entry_id, changed_at DESC)
      `);
      // Log of "แจ้งปัญหา" report/resolve cycles — one row per cycle (report
      // fills the reported_* columns, resolve later fills resolved_*; NULL
      // resolved_at means still open). entry_id/entry_*/*_username are
      // deliberate denormalized snapshots, not FKs: this table lives in a
      // separate database from gamedb_users (see file header), and the
      // itune entry itself may be deleted later — history should stay
      // legible either way. entry_* beyond email/id capture the entry's full
      // editable field set as it stood at report time, so the history view
      // still shows everything about the affected row even after it's been
      // edited or deleted since.
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_issue_log (
          id                    SERIAL PRIMARY KEY,
          entry_id              INTEGER NOT NULL,
          entry_email           TEXT,
          entry_password        TEXT,
          entry_currency        TEXT,
          entry_supplier        TEXT,
          entry_amount          NUMERIC(14,2),
          entry_link_sms        TEXT,
          entry_qna             TEXT,
          note                  TEXT NOT NULL,
          reported_by_user_id   INTEGER,
          reported_by_username  TEXT,
          reported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_by_user_id   INTEGER,
          resolved_by_username  TEXT,
          resolved_at           TIMESTAMPTZ
        )
      `);
      // Added after the table already existed — same convention as
      // projectm_itune_entries.supplier above.
      await client.query(`
        ALTER TABLE projectm_itune_issue_log
        ADD COLUMN IF NOT EXISTS entry_password TEXT,
        ADD COLUMN IF NOT EXISTS entry_currency TEXT,
        ADD COLUMN IF NOT EXISTS entry_supplier TEXT,
        ADD COLUMN IF NOT EXISTS entry_amount NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS entry_link_sms TEXT,
        ADD COLUMN IF NOT EXISTS entry_qna TEXT
      `);
      // "Reject" (see rejectItuneEntry) rides the same issue_log table as
      // "แจ้งปัญหา" — it's the same "mark unavailable, admin must resolve"
      // shape, just triggered by the claimant instead of an admin.
      // is_reject distinguishes the two in the history view and, more
      // importantly, is checked forever by claimItuneEntry (once confirmed —
      // see reject_confirmed_at below) to permanently keep the rejecting
      // user from being handed this same entry again.
      await client.query(`
        ALTER TABLE projectm_itune_issue_log
        ADD COLUMN IF NOT EXISTS is_reject BOOLEAN NOT NULL DEFAULT FALSE
      `);
      // A "Reject" only ever creates a *request* — rejectItuneEntry doesn't
      // touch the entry at all, it just inserts this row with
      // reject_confirmed_at left NULL. The entry only actually gets pulled
      // from the pool (unclaimed + marked unavailable) once an admin calls
      // confirmItuneReject, which is also the moment claimItuneEntry's
      // permanent per-user exclusion starts applying — a still-pending
      // request doesn't block anything yet. declineItuneReject is the other
      // way out (clears is_reject instead, as if it never happened);
      // cancelItuneReject undoes an already-confirmed one.
      await client.query(`
        ALTER TABLE projectm_itune_issue_log
        ADD COLUMN IF NOT EXISTS reject_confirmed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reject_confirmed_by_user_id INTEGER,
        ADD COLUMN IF NOT EXISTS reject_confirmed_by_username TEXT
      `);
      // Topup "รับเมล" self-service claim — claimed_by_user_id/claimed_at
      // mark a row as held by a topup user (see claimItuneEntry/
      // releaseItuneEntry). Same convention as supplier/entry_* above.
      await client.query(`
        ALTER TABLE projectm_itune_entries
        ADD COLUMN IF NOT EXISTS claimed_by_user_id INTEGER,
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ
      `);
      // "ตั้งเป็นเมลถาวร" — admin override that exempts a row's countdown
      // from ever counting (see setItuneEntryPermanent/ItuneCountdownCell),
      // independent of the amount-derived status.
      await client.query(`
        ALTER TABLE projectm_itune_entries
        ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT FALSE
      `);
      // Claim-queue controls, driven from the admin "จัดคิวรับเมล" page (see
      // listItunePriorityQueue/reorderItunePriority). priority_order is the
      // manual pin: NULL means "leave this one to the automatic rule",
      // a number means an admin placed it explicitly and it outranks every
      // unpinned row (see claimItuneEntry's ORDER BY). claim_hold takes a
      // single row out of the claimable pool without touching its status,
      // the per-row counterpart to the global claim_paused switch on the
      // settings singleton below.
      await client.query(`
        ALTER TABLE projectm_itune_entries
        ADD COLUMN IF NOT EXISTS priority_order INTEGER,
        ADD COLUMN IF NOT EXISTS claim_hold BOOLEAN NOT NULL DEFAULT FALSE
      `);
      // Log of "อัปเดตยอดคงเหลือ" (update remaining balance) actions a topup
      // user makes while holding a claimed row — one row per adjustment, so
      // the balance's history stays auditable even though the live entry
      // only ever carries its current amount. entry_id/entry_email/
      // *_username denormalized snapshots for the same cross-database reason
      // as projectm_itune_issue_log (see that table's comment above). The
      // very first row for an entry is written at claim time (see
      // claimItuneEntry) with old_amount = new_amount, so the history always
      // starts from the balance as it stood when the claimant took it over
      // — not just from whenever the first real adjustment happens to land.
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_amount_log (
          id                    SERIAL PRIMARY KEY,
          entry_id              INTEGER NOT NULL,
          entry_email           TEXT,
          old_amount            NUMERIC(14,2) NOT NULL,
          new_amount            NUMERIC(14,2) NOT NULL,
          image                 TEXT,
          changed_by_user_id    INTEGER,
          changed_by_username   TEXT,
          changed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Added after the table already existed — same convention as
      // projectm_itune_entries.supplier above.
      await client.query(`
        ALTER TABLE projectm_itune_amount_log
        ADD COLUMN IF NOT EXISTS image TEXT
      `);
      // "คืนเมล" (release) threshold — a topup user may only release their own
      // claim back to the pool once its Amount has dropped below this value
      // (see releaseItuneEntry). Same singleton-row JSONB-config shape as
      // projectm_itune_status_rules, just a single NUMERIC instead of an
      // array since there's only one number to hold.
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_release_settings (
          id                    INTEGER PRIMARY KEY DEFAULT 1,
          max_amount            NUMERIC(14,2) NOT NULL,
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_by_user_id    INTEGER,
          updated_by_username   TEXT,
          CONSTRAINT projectm_itune_release_settings_singleton CHECK (id = 1)
        )
      `);
      // Same singleton row now also carries the claim-queue settings (see
      // getItuneClaimSettings) — one row, one read, rather than a second
      // config table for two more scalars. claim_paused stops "รับเมล"
      // outright for everyone; priority_amount_threshold is the cutoff
      // above which an entry sorts into the "ด่วน" tier ahead of the
      // ordinary oldest-first queue (see claimItuneEntry's ORDER BY).
      await client.query(`
        ALTER TABLE projectm_itune_release_settings
        ADD COLUMN IF NOT EXISTS claim_paused BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS priority_amount_threshold NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS target_hours NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS burn_rate_usd_per_hour NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS expected_idle_hours NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS claim_warning_hours NUMERIC(8,2)
      `);
      // "log คนเติม" (topup activity log, see the admin page's ปัจจุบัน/
      // ประวัติ tabs) — one row per claim/release/reject, so who's holding
      // what right now (live: just read claimed_by_user_id off the entries
      // table, no log needed) AND who held what in the past (history: this
      // table, since the entry itself only ever remembers its current
      // claimant) are both answerable. entry_email/username denormalized
      // snapshots for the same cross-database reason as
      // projectm_itune_issue_log (see that table's comment above).
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_claim_log (
          id            SERIAL PRIMARY KEY,
          entry_id      INTEGER NOT NULL,
          entry_email   TEXT,
          action        TEXT NOT NULL CHECK (action IN ('claim', 'release', 'reject', 'reject_confirm', 'reject_decline', 'cancel_reject')),
          user_id       INTEGER,
          username      TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // issue_log_id links a 'reject'/'reject_confirm'/'reject_decline' row
      // back to the projectm_itune_issue_log row it concerns (see
      // rejectItuneEntry/confirmItuneReject/declineItuneReject) — how the
      // topup-log page's ยืนยัน/ปฏิเสธคำขอ/ยกเลิก buttons find what to act
      // on, and how listItuneClaimLog knows a given 'reject' row's current
      // pending/confirmed/declined state (via the join in that function).
      // Added after the table already existed — same convention as
      // projectm_itune_entries.supplier above. The CHECK on `action` was
      // widened at the same time (twice now) — inline column CHECKs can't
      // use ADD COLUMN IF NOT EXISTS, so it's dropped and re-added instead;
      // safe to re-run since DROP uses IF EXISTS and each new constraint is
      // a superset of the last.
      await client.query(`
        ALTER TABLE projectm_itune_claim_log
        ADD COLUMN IF NOT EXISTS issue_log_id INTEGER
      `);
      await client.query(`
        ALTER TABLE projectm_itune_claim_log
        DROP CONSTRAINT IF EXISTS projectm_itune_claim_log_action_check
      `);
      await client.query(`
        ALTER TABLE projectm_itune_claim_log
        ADD CONSTRAINT projectm_itune_claim_log_action_check
        CHECK (action IN ('claim', 'release', 'reject', 'reject_confirm', 'reject_decline', 'cancel_reject'))
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS projectm_itune_claim_log_issue_time_idx
        ON projectm_itune_claim_log (issue_log_id, created_at, id)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_claim_sessions (
          id BIGSERIAL PRIMARY KEY,
          entry_id INTEGER NOT NULL,
          entry_email TEXT,
          user_id INTEGER,
          username TEXT,
          claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          released_at TIMESTAMPTZ,
          start_amount NUMERIC(14,2) NOT NULL,
          end_amount NUMERIC(14,2),
          amount_used NUMERIC(14,2),
          outcome TEXT CHECK (outcome IN ('depleted', 'partial_release', 'unusable')),
          proof_image TEXT,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS projectm_itune_claim_sessions_entry_idx
        ON projectm_itune_claim_sessions (entry_id, claimed_at DESC)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS projectm_itune_admin_log (
          id BIGSERIAL PRIMARY KEY,
          category TEXT NOT NULL CHECK (category IN ('system', 'admin')),
          action TEXT NOT NULL,
          entry_id INTEGER,
          entry_email TEXT,
          old_values JSONB,
          new_values JSONB,
          details JSONB,
          actor_user_id INTEGER,
          actor_username TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // A previous startup may already have installed the append-only trigger
      // before discovering this legacy schema. Permit only its one-time
      // category backfill, then replace this function with the strict version.
      await client.query(`
        CREATE OR REPLACE FUNCTION projectm_itune_admin_log_append_only()
        RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'UPDATE' AND OLD.category IS NULL AND NEW.category IS NOT NULL THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'projectm_itune_admin_log is append-only';
        END;
        $$ LANGUAGE plpgsql
      `);
      await client.query(`
        ALTER TABLE projectm_itune_admin_log
        ADD COLUMN IF NOT EXISTS category TEXT,
        ADD COLUMN IF NOT EXISTS entry_id INTEGER,
        ADD COLUMN IF NOT EXISTS entry_email TEXT,
        ADD COLUMN IF NOT EXISTS old_values JSONB,
        ADD COLUMN IF NOT EXISTS new_values JSONB,
        ADD COLUMN IF NOT EXISTS actor_user_id INTEGER,
        ADD COLUMN IF NOT EXISTS actor_username TEXT
      `);
      await client.query(`
        UPDATE projectm_itune_admin_log
        SET action = CASE action
              WHEN 'clear_logs' THEN 'history_clear'
              WHEN 'reject_cancel' THEN 'cancel_reject'
              ELSE action
            END,
            category = COALESCE(category, 'admin'),
            entry_id = COALESCE(entry_id,
              NULLIF(to_jsonb(projectm_itune_admin_log)->>'target_id', '')::INTEGER),
            actor_user_id = COALESCE(actor_user_id,
              NULLIF(to_jsonb(projectm_itune_admin_log)->>'user_id', '')::INTEGER),
            actor_username = COALESCE(actor_username,
              to_jsonb(projectm_itune_admin_log)->>'username')
        WHERE category IS NULL
      `);
      await client.query(`
        ALTER TABLE projectm_itune_admin_log
        ALTER COLUMN category SET NOT NULL,
        DROP CONSTRAINT IF EXISTS projectm_itune_admin_log_category_check
      `);
      await client.query(`
        ALTER TABLE projectm_itune_admin_log
        ADD CONSTRAINT projectm_itune_admin_log_category_check
        CHECK (category IN ('system', 'admin'))
      `);
      await client.query(`
        CREATE OR REPLACE FUNCTION projectm_itune_admin_log_append_only()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'projectm_itune_admin_log is append-only';
        END;
        $$ LANGUAGE plpgsql
      `);
      await client.query(`
        DO $$
        BEGIN
          CREATE TRIGGER projectm_itune_admin_log_append_only
          BEFORE UPDATE OR DELETE ON projectm_itune_admin_log
          FOR EACH ROW EXECUTE FUNCTION projectm_itune_admin_log_append_only();
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS projectm_itune_admin_log_time_idx
        ON projectm_itune_admin_log (created_at DESC)
      `);
      await client.query(`
        ALTER TABLE projectm_itune_entries
        ADD COLUMN IF NOT EXISTS active_claim_session_id BIGINT
      `);
    } finally {
      client.release();
    }
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

async function getReadyPool() {
  const connection = await getItuneConnection();
  if (!connection) {
    throw createHttpError(
      `ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}" — เพิ่ม Connection ชื่อนี้ก่อนที่หน้า Connections`,
      503
    );
  }
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

export async function listItuneEntries() {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT e.*, ${HAS_PENDING_REJECT_SQL} FROM projectm_itune_entries e ORDER BY id ASC`
  );
  const usernamesById = await fetchUsernamesById(
    result.rows.flatMap((r) => [r.created_by_user_id, r.claimed_by_user_id])
  );
  return result.rows.map((row) => mapRow(row, usernamesById));
}

export async function insertItuneEntry({ createdByUserId, addedAt, ...fields }, actor) {
  const pool = await getReadyPool();
  // ID (col 1) always picks up right after the current highest id, not
  // whatever the table's own SERIAL sequence has drifted to — rows deleted
  // during testing/use otherwise leave the sequence way ahead of the real
  // row count. LOCK TABLE serializes this against any other concurrent
  // insert so two admins adding at once can't compute the same "next id".
  const columns = ["id", "created_by_user_id"];
  const placeholders = [
    "(SELECT COALESCE(MAX(id), 0) + 1 FROM projectm_itune_entries)",
    "$1",
  ];
  const values = [createdByUserId];
  let i = 2;

  // The countdown (col 2) starts ticking client-side the moment "เพิ่มรายการ"
  // is clicked, before the row is ever saved — so the timestamp that becomes
  // authoritative here is the one captured at that moment, not whenever the
  // save request happens to land. Falls back to the column's own NOW()
  // default if the client didn't send one.
  if (addedAt) {
    columns.push("added_at");
    placeholders.push(`$${i++}`);
    values.push(addedAt);
  }

  for (const key of EDITABLE_FIELDS) {
    if (fields[key] === undefined) continue;
    columns.push(FIELD_COLUMNS[key]);
    placeholders.push(`$${i++}`);
    values.push(fields[key]);
  }

  const client = await pool.connect();
  let insertedId;
  try {
    await client.query("BEGIN");
    await client.query(
      "LOCK TABLE projectm_itune_entries IN SHARE ROW EXCLUSIVE MODE"
    );
    // Link_SMS must be unique across all entries (blank is exempt — plenty of
    // rows have no SMS link yet). Checked here, inside the same
    // transaction/table-lock the id-assignment logic above already takes, so
    // two concurrent inserts can't both pass the check for the same value —
    // the lock serializes them.
    if (fields.linkSms) {
      const dup = await client.query(
        `SELECT id FROM projectm_itune_entries WHERE link_sms = $1 LIMIT 1`,
        [fields.linkSms]
      );
      if (dup.rows.length > 0) {
        throw createHttpError(`Link_SMS นี้ถูกใช้แล้วที่ ID ${dup.rows[0].id}`, 409);
      }
    }
    const result = await client.query(
      `INSERT INTO projectm_itune_entries (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      values
    );
    const inserted = result.rows[0];
    insertedId = inserted.id;
    await insertEntryLog(client, {
      row: inserted,
      action: "create",
      actor,
      newValues: entryAuditValues(inserted),
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const entry = await findItuneEntryById(insertedId);
  publishItuneQueueChanged();
  return entry;
}

export async function findItuneEntryById(id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT e.*, ${HAS_PENDING_REJECT_SQL} FROM projectm_itune_entries e WHERE id = $1`,
    [numeric]
  );
  const row = result.rows[0];
  if (!row) return null;
  const usernamesById = await fetchUsernamesById([row.created_by_user_id, row.claimed_by_user_id]);
  return mapRow(row, usernamesById);
}

export async function updateItuneEntry(id, fields, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  let changed = false;
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT * FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw createHttpError("ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)", 404);

    if (fields.linkSms) {
      const dup = await client.query(
        `SELECT id FROM projectm_itune_entries WHERE link_sms = $1 AND id <> $2 LIMIT 1`,
        [fields.linkSms, id]
      );
      if (dup.rows.length > 0) {
        throw createHttpError(`Link_SMS นี้ถูกใช้แล้วที่ ID ${dup.rows[0].id}`, 409);
      }
    }

    const sets = [];
    const values = [];
    const oldValues = {};
    const newValues = {};
    let i = 1;
    for (const key of EDITABLE_FIELDS) {
      if (fields[key] === undefined) continue;
      const before = current[FIELD_COLUMNS[key]];
      if (valuesMatch(key, before, fields[key])) continue;
      sets.push(`${FIELD_COLUMNS[key]} = $${i++}`);
      values.push(fields[key]);
      oldValues[key] = auditValue(key, before);
      newValues[key] = auditValue(key, fields[key]);
    }

    if (sets.length) {
      sets.push("updated_at = NOW()");
      values.push(id);
      await client.query(
        `UPDATE projectm_itune_entries SET ${sets.join(", ")} WHERE id = $${i}`,
        values
      );
      await insertEntryLog(client, {
        row: current,
        action: "update",
        actor,
        oldValues,
        newValues,
      });
      changed = true;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  if (changed) publishItuneQueueChanged();
  return entry;
}

// "แจ้งปัญหา" (report issue) — same shape as saveItuneEntryImage: a
// dedicated, narrow write path outside the general EDITABLE_FIELDS update,
// since it's a distinct action (report + force status) rather than a normal
// field edit. Also appends a row to projectm_itune_issue_log so the report
// survives even after the status override itself gets cleared by resolve —
// wrapped in a transaction so the status flip and the log entry can't drift
// apart if either write fails.
export async function reportItuneEntryIssue(id, note, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT email, password, currency, supplier, amount, link_sms, qna
       FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      throw createHttpError("ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)", 404);
    }
    const snapshot = rows[0];
    await client.query(
      `UPDATE projectm_itune_entries
       SET status = $1, other_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [ITUNE_UNAVAILABLE_STATUS, note, id]
    );
    await client.query(
      `INSERT INTO projectm_itune_issue_log
         (entry_id, entry_email, entry_password, entry_currency, entry_supplier,
          entry_amount, entry_link_sms, entry_qna, note,
          reported_by_user_id, reported_by_username)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        snapshot.email || null,
        snapshot.password || null,
        snapshot.currency || null,
        snapshot.supplier || null,
        snapshot.amount,
        snapshot.link_sms || null,
        snapshot.qna || null,
        note,
        actor?.id ?? null,
        actor?.displayName || actor?.username || null,
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  publishItuneQueueChanged();
  return entry;
}

// Undoes reportItuneEntryIssue — clears the status override so the row falls
// back to the amount-derived status (see computeEffectiveItuneStatus), and
// closes out the matching open log row (resolved_at IS NULL) so it shows up
// as fixed in the history view.
export async function resolveItuneEntryIssue(id, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id FROM projectm_itune_issue_log
       WHERE entry_id = $1 AND resolved_at IS NULL
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [id]
    );
    if (rows[0]) {
      await client.query(
        `UPDATE projectm_itune_issue_log
         SET resolved_by_user_id = $1, resolved_by_username = $2, resolved_at = NOW()
         WHERE id = $3`,
        [actor?.id ?? null, actor?.displayName || actor?.username || null, rows[0].id]
      );
    }
    await client.query(
      `UPDATE projectm_itune_entries
       SET status = NULL, other_notes = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  publishItuneQueueChanged();
  return entry;
}

// "Reject" — a topup user's own "something's wrong with this one" request,
// distinct from "คืนเมล" (release): no Amount-threshold or confirm-image
// requirement, and it does NOT touch the entry at all — it only files a
// request (an issue_log row with is_reject=TRUE and reject_confirmed_at
// left NULL) that sits pending until an admin calls confirmItuneReject or
// declineItuneReject. `reason` (required — see ItuneRejectRequestModal in
// itune-topup-card.js) becomes the log row's note, so admin sees WHY when
// deciding whether to approve it. The entry stays claimed by actor (still
// counts against their MAX_CLAIMS_PER_USER cap) the whole time it's
// pending. Only the current claimant (or a projectm-admin) may request it.
export async function rejectItuneEntry(id, reason, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT email, password, currency, supplier, amount, link_sms, qna, claimed_by_user_id
       FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      throw createHttpError("ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)", 404);
    }
    const snapshot = rows[0];
    if (!isProjectmAdminActor(actor) && snapshot.claimed_by_user_id !== actor.id) {
      throw createHttpError("คุณไม่ใช่ผู้รับเมลนี้", 403);
    }
    const { rows: pendingRows } = await client.query(
      `SELECT id FROM projectm_itune_issue_log
       WHERE entry_id = $1 AND is_reject AND reject_confirmed_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [id]
    );
    if (pendingRows.length > 0) {
      throw createHttpError("มีคำขอ Reject ที่รอแอดมินยืนยันอยู่แล้ว", 400);
    }
    const note = reason;
    const { rows: issueRows } = await client.query(
      `INSERT INTO projectm_itune_issue_log
         (entry_id, entry_email, entry_password, entry_currency, entry_supplier,
          entry_amount, entry_link_sms, entry_qna, note, is_reject,
          reported_by_user_id, reported_by_username)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11)
       RETURNING id`,
      [
        id,
        snapshot.email || null,
        snapshot.password || null,
        snapshot.currency || null,
        snapshot.supplier || null,
        snapshot.amount,
        snapshot.link_sms || null,
        snapshot.qna || null,
        note,
        actor?.id ?? null,
        actor?.displayName || actor?.username || null,
      ]
    );
    await insertClaimLog(client, {
      entryId: id,
      entryEmail: snapshot.email,
      action: "reject",
      actor,
      issueLogId: issueRows[0].id,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return findItuneEntryById(id);
}

// Admin approves a pending Reject request (see rejectItuneEntry) — the
// actual effect, deliberately narrow: unclaim the entry so it's immediately
// claimable by anyone else, and flip reject_confirmed_at so
// claimItuneEntry's NOT EXISTS check starts excluding just the rejecting
// user from it, permanently. Nothing else about the entry changes — it does
// NOT get marked unavailable (that would block everyone, not just the
// rejecter) and its Amount/status are untouched.
export async function confirmItuneReject(claimLogId, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  let entryId;
  try {
    await client.query("BEGIN");
    const { rows: claimRows } = await client.query(
      `SELECT entry_id, entry_email, action, issue_log_id FROM projectm_itune_claim_log WHERE id = $1`,
      [claimLogId]
    );
    if (claimRows.length === 0) {
      throw createHttpError("ไม่พบคำขอนี้ (อาจถูกลบไปแล้ว)", 404);
    }
    const claimRow = claimRows[0];
    entryId = claimRow.entry_id;
    if (claimRow.action !== "reject" || !claimRow.issue_log_id) {
      throw createHttpError("รายการนี้ไม่ใช่คำขอ Reject", 400);
    }
    const { rows: issueRows } = await client.query(
      `SELECT id, entry_id, is_reject, reject_confirmed_at, reported_by_user_id
       FROM projectm_itune_issue_log WHERE id = $1 FOR UPDATE`,
      [claimRow.issue_log_id]
    );
    if (issueRows.length === 0) {
      throw createHttpError("ไม่พบคำขอ Reject ที่เชื่อมกับรายการนี้", 404);
    }
    const issueRow = issueRows[0];
    if (!issueRow.is_reject) {
      throw createHttpError("คำขอนี้ถูกปฏิเสธไปแล้ว", 400);
    }
    if (issueRow.reject_confirmed_at) {
      throw createHttpError("คำขอนี้ถูกยืนยันไปแล้ว", 400);
    }
    await client.query(
      `UPDATE projectm_itune_entries
       SET claimed_by_user_id = NULL, claimed_at = NULL, updated_at = NOW()
       WHERE id = $1 AND claimed_by_user_id = $2`,
      [issueRow.entry_id, issueRow.reported_by_user_id]
    );
    await client.query(
      `UPDATE projectm_itune_issue_log
       SET reject_confirmed_at = NOW(), reject_confirmed_by_user_id = $1, reject_confirmed_by_username = $2
       WHERE id = $3`,
      [actor?.id ?? null, actor?.displayName || actor?.username || null, issueRow.id]
    );
    await insertClaimLog(client, {
      entryId: issueRow.entry_id,
      entryEmail: claimRow.entry_email,
      action: "reject_confirm",
      actor,
      issueLogId: issueRow.id,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(entryId);
  publishItuneQueueChanged();
  return entry;
}

// Admin declines a pending Reject request — dismisses it as if it never
// happened (is_reject cleared, so it's simply not looked at by
// claimItuneEntry or the "ยกเลิก"/cancelItuneReject flow, which is for
// already-confirmed rejects only). The entry itself was never touched by
// rejectItuneEntry in the first place, so there's nothing to revert there.
export async function declineItuneReject(claimLogId, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  let entryId;
  try {
    await client.query("BEGIN");
    const { rows: claimRows } = await client.query(
      `SELECT entry_id, entry_email, action, issue_log_id FROM projectm_itune_claim_log WHERE id = $1`,
      [claimLogId]
    );
    if (claimRows.length === 0) {
      throw createHttpError("ไม่พบคำขอนี้ (อาจถูกลบไปแล้ว)", 404);
    }
    const claimRow = claimRows[0];
    entryId = claimRow.entry_id;
    if (claimRow.action !== "reject" || !claimRow.issue_log_id) {
      throw createHttpError("รายการนี้ไม่ใช่คำขอ Reject", 400);
    }
    const { rows: issueRows } = await client.query(
      `SELECT id, is_reject, reject_confirmed_at FROM projectm_itune_issue_log WHERE id = $1 FOR UPDATE`,
      [claimRow.issue_log_id]
    );
    if (issueRows.length === 0) {
      throw createHttpError("ไม่พบคำขอ Reject ที่เชื่อมกับรายการนี้", 404);
    }
    const issueRow = issueRows[0];
    if (!issueRow.is_reject) {
      throw createHttpError("คำขอนี้ถูกปฏิเสธไปแล้ว", 400);
    }
    if (issueRow.reject_confirmed_at) {
      throw createHttpError("คำขอนี้ถูกยืนยันไปแล้ว ใช้ยกเลิก Reject แทน", 400);
    }
    await client.query(`UPDATE projectm_itune_issue_log SET is_reject = FALSE WHERE id = $1`, [
      issueRow.id,
    ]);
    await insertClaimLog(client, {
      entryId,
      entryEmail: claimRow.entry_email,
      action: "reject_decline",
      actor,
      issueLogId: issueRow.id,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return findItuneEntryById(entryId);
}

// "ยกเลิก" (undo) an already-CONFIRMED reject — the counterpart to
// declineItuneReject, which is for a still-pending request instead. Clears
// the linked issue_log row's is_reject so claimItuneEntry's permanent
// per-user exclusion (see that function) no longer applies; the entry
// itself needs no further changes since confirmItuneReject never marked it
// unavailable, only unclaimed it (which cancelling doesn't need to undo —
// there's nothing to give back, it's just open to everyone including the
// formerly-rejecting user again now). Takes the 'reject_confirm'
// projectm_itune_claim_log row's own id (what the history table renders
// the "ยกเลิก" button on), not the issue_log id directly.
export async function cancelItuneReject(claimLogId, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  let entryId;
  try {
    await client.query("BEGIN");
    const { rows: claimRows } = await client.query(
      `SELECT entry_id, entry_email, action, issue_log_id FROM projectm_itune_claim_log WHERE id = $1`,
      [claimLogId]
    );
    if (claimRows.length === 0) {
      throw createHttpError("ไม่พบประวัตินี้ (อาจถูกลบไปแล้ว)", 404);
    }
    const claimRow = claimRows[0];
    entryId = claimRow.entry_id;
    if (claimRow.action !== "reject_confirm" || !claimRow.issue_log_id) {
      throw createHttpError("รายการนี้ไม่ใช่ reject ที่ยืนยันแล้ว", 400);
    }
    const { rows: issueRows } = await client.query(
      `SELECT id, is_reject, reject_confirmed_at FROM projectm_itune_issue_log WHERE id = $1 FOR UPDATE`,
      [claimRow.issue_log_id]
    );
    if (issueRows.length === 0) {
      throw createHttpError("ไม่พบรายการแจ้งปัญหาที่เชื่อมกับ reject นี้", 404);
    }
    const issueRow = issueRows[0];
    if (!issueRow.is_reject) {
      throw createHttpError("รายการนี้ถูกยกเลิกไปแล้ว", 400);
    }
    if (!issueRow.reject_confirmed_at) {
      throw createHttpError("คำขอนี้ยังไม่ได้ยืนยัน ใช้ปฏิเสธคำขอแทน", 400);
    }
    await client.query(`UPDATE projectm_itune_issue_log SET is_reject = FALSE WHERE id = $1`, [
      issueRow.id,
    ]);
    await insertClaimLog(client, {
      entryId,
      entryEmail: claimRow.entry_email,
      action: "cancel_reject",
      actor,
      issueLogId: issueRow.id,
    });
    await insertAdminLog(client, {
      category: "admin",
      action: "cancel_reject",
      actor,
      entryId,
      entryEmail: claimRow.entry_email,
      details: { issueLogId: issueRow.id, claimLogId: Number(claimLogId) },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return findItuneEntryById(entryId);
}

// Read side for the "ประวัติการแจ้งปัญหา" (issue history) panel —
// resolved: true/false narrows to fixed/still-open, undefined returns both.
export async function listItuneIssueLog({ limit = 200, resolved } = {}) {
  const pool = await getReadyPool();
  const conditions = [];
  if (resolved === true) conditions.push("resolved_at IS NOT NULL");
  if (resolved === false) conditions.push("resolved_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const cappedLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  const result = await pool.query(
    `SELECT * FROM projectm_itune_issue_log ${where} ORDER BY id DESC LIMIT $1`,
    [cappedLimit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    entryEmail: row.entry_email || "",
    entryPassword: row.entry_password || "",
    entryCurrency: row.entry_currency || "",
    entrySupplier: row.entry_supplier || "",
    entryAmount: row.entry_amount == null ? null : Number(row.entry_amount),
    entryLinkSms: row.entry_link_sms || "",
    entryQna: row.entry_qna || "",
    note: row.note,
    isReject: row.is_reject || false,
    reportedByUsername: row.reported_by_username || "",
    reportedAt: row.reported_at,
    resolvedByUsername: row.resolved_by_username || "",
    resolvedAt: row.resolved_at,
  }));
}

export async function deleteItuneEntry(id, actor) {
  return deleteItuneEntries([id], actor);
}

export async function deleteItuneEntries(ids, actor) {
  const numericIds = [...new Set(ids.map(Number))];
  if (!numericIds.length || numericIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createHttpError("รายการที่จะลบไม่ถูกต้อง", 400);
  }
  if (numericIds.length > 500) throw createHttpError("ลบได้ครั้งละไม่เกิน 500 รายการ", 400);

  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, email, currency, supplier, amount, link_sms, qna,
              CASE WHEN password IS NULL OR password = '' THEN '' ELSE '[redacted]' END AS password,
              CASE WHEN amount_confirm_image IS NULL OR amount_confirm_image = ''
                   THEN '' ELSE '[image]' END AS amount_confirm_image
       FROM projectm_itune_entries WHERE id = ANY($1::int[]) FOR UPDATE`,
      [numericIds]
    );
    if (result.rows.length !== numericIds.length) {
      throw createHttpError("มีบางรายการไม่อยู่แล้ว กรุณาโหลดหน้าใหม่", 409);
    }
    const action = numericIds.length > 1 ? "bulk_delete" : "delete";
    // ponytail: one audit insert per row; batch it if 500-row deletes become slow.
    for (const row of result.rows) {
      await insertEntryLog(client, {
        row,
        action,
        actor,
        oldValues: entryAuditValues(row),
      });
    }
    if (numericIds.length > 1) {
      await insertAdminLog(client, {
        category: "admin",
        action: "bulk_delete",
        actor,
        details: {
          count: numericIds.length,
          entryIds: numericIds,
          emails: result.rows.map((row) => row.email || ""),
        },
      });
    }
    await client.query(`DELETE FROM projectm_itune_entries WHERE id = ANY($1::int[])`, [numericIds]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  publishItuneQueueChanged();
  return numericIds.length;
}

export async function listItuneEntryLogs(limit = 200) {
  const pool = await getReadyPool();
  const cappedLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  const result = await pool.query(
    `SELECT id, entry_id, entry_email, action, old_values, new_values,
            changed_by_user_id, changed_by_username, changed_at
     FROM projectm_itune_entry_log ORDER BY id DESC LIMIT $1`,
    [cappedLimit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    entryEmail: row.entry_email || "",
    action: row.action,
    oldValues: row.old_values || {},
    newValues: row.new_values || {},
    changedByUserId: row.changed_by_user_id || null,
    changedByUsername: row.changed_by_username || "",
    changedAt: row.changed_at,
  }));
}

const ITUNE_HISTORY_CATEGORIES = new Set(["claim", "amount", "issue", "entry", "system", "admin"]);

export async function listItuneHistory({ category, query, from, to, page = 1, pageSize = 50 } = {}) {
  const pool = await getReadyPool();
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 50));
  const conditions = [];
  const values = [];
  const addValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (category && category !== "all") {
    if (!ITUNE_HISTORY_CATEGORIES.has(category)) throw createHttpError("ประเภทประวัติไม่ถูกต้อง", 400);
    conditions.push(`category = ${addValue(category)}`);
  }
  const cleanQuery = String(query || "").trim();
  if (cleanQuery) {
    const placeholder = addValue(`%${cleanQuery}%`);
    conditions.push(`(
      COALESCE(entry_email, '') ILIKE ${placeholder}
      OR COALESCE(actor_username, '') ILIKE ${placeholder}
      OR action ILIKE ${placeholder}
      OR COALESCE(entry_id::text, '') ILIKE ${placeholder}
    )`);
  }
  if (from) {
    if (!Number.isFinite(Date.parse(from))) throw createHttpError("วันที่เริ่มต้นไม่ถูกต้อง", 400);
    conditions.push(`occurred_at >= ${addValue(from)}::date`);
  }
  if (to) {
    if (!Number.isFinite(Date.parse(to))) throw createHttpError("วันที่สิ้นสุดไม่ถูกต้อง", 400);
    conditions.push(`occurred_at < (${addValue(to)}::date + INTERVAL '1 day')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitPlaceholder = addValue(safePageSize);
  const offsetPlaceholder = addValue((safePage - 1) * safePageSize);
  const result = await pool.query(
    `WITH history AS (
       SELECT 'claim-session-claim-' || s.id AS source_key, 'claim' AS category,
              'claim' AS action, s.entry_id, s.entry_email,
              s.user_id AS actor_user_id, s.username AS actor_username,
              s.claimed_at AS occurred_at, NULL::jsonb AS old_values,
              jsonb_build_object('startAmount', s.start_amount) AS new_values,
              '{}'::jsonb AS details, NULL::bigint AS claim_log_id,
              FALSE AS can_confirm, FALSE AS can_decline, FALSE AS can_cancel,
              FALSE AS has_image, NULL::text AS image_kind, NULL::bigint AS image_id
       FROM projectm_itune_claim_sessions s
       UNION ALL
       SELECT 'claim-session-release-' || s.id, 'claim', 'release', s.entry_id, s.entry_email,
              s.user_id, s.username, s.released_at,
              jsonb_build_object('startAmount', s.start_amount),
              jsonb_build_object('endAmount', s.end_amount),
              jsonb_build_object('amountUsed', s.amount_used, 'outcome', s.outcome, 'note', s.note),
              NULL::bigint, FALSE, FALSE, FALSE,
              COALESCE(s.proof_image, '') <> '', 'claim-session', s.id
       FROM projectm_itune_claim_sessions s WHERE s.released_at IS NOT NULL
       UNION ALL
       SELECT 'amount-' || a.id, 'amount', 'amount_update', a.entry_id, a.entry_email,
              a.changed_by_user_id, a.changed_by_username, a.changed_at,
              jsonb_build_object('amount', a.old_amount),
              jsonb_build_object('amount', a.new_amount), '{}'::jsonb,
              NULL::bigint, FALSE, FALSE, FALSE,
              COALESCE(a.image, '') <> '', 'amount', a.id::bigint
       FROM projectm_itune_amount_log a
       UNION ALL
       SELECT 'issue-' || i.id, 'issue', 'issue_report', i.entry_id, i.entry_email,
              i.reported_by_user_id, i.reported_by_username, i.reported_at,
              NULL::jsonb, NULL::jsonb,
              jsonb_build_object(
                'note', i.note, 'status', CASE WHEN i.resolved_at IS NULL THEN 'open' ELSE 'resolved' END,
                'resolvedAt', i.resolved_at, 'resolvedByUsername', i.resolved_by_username
              ), NULL::bigint, FALSE, FALSE, FALSE, FALSE, NULL::text, NULL::bigint
       FROM projectm_itune_issue_log i
       WHERE NOT EXISTS (
         SELECT 1 FROM projectm_itune_claim_log linked WHERE linked.issue_log_id = i.id
       )
       UNION ALL
       SELECT 'reject-' || c.id, 'issue', c.action, c.entry_id, c.entry_email,
              c.user_id, c.username, c.created_at, NULL::jsonb, NULL::jsonb,
              jsonb_build_object(
                'note', i.note,
                'issueLogId', i.id,
                'rejectTimeline', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'action', timeline.action,
                    'actorUserId', timeline.user_id,
                    'actorUsername', timeline.username,
                    'occurredAt', timeline.created_at
                  ) ORDER BY timeline.created_at, timeline.id)
                  FROM projectm_itune_claim_log timeline
                  WHERE timeline.issue_log_id = i.id
                ), '[]'::jsonb)
              ), c.id::bigint,
              c.action = 'reject' AND i.is_reject = TRUE AND i.reject_confirmed_at IS NULL,
              c.action = 'reject' AND i.is_reject = TRUE AND i.reject_confirmed_at IS NULL,
              c.action = 'reject_confirm' AND i.is_reject = TRUE AND i.reject_confirmed_at IS NOT NULL,
              FALSE, NULL::text, NULL::bigint
       FROM projectm_itune_claim_log c
       LEFT JOIN projectm_itune_issue_log i ON i.id = c.issue_log_id
       WHERE c.action NOT IN ('claim', 'release')
       UNION ALL
       SELECT 'entry-' || e.id, 'entry', e.action, e.entry_id, e.entry_email,
              e.changed_by_user_id, e.changed_by_username, e.changed_at,
              e.old_values, e.new_values, '{}'::jsonb, NULL::bigint,
              FALSE, FALSE, FALSE, FALSE, NULL::text, NULL::bigint
       FROM projectm_itune_entry_log e
       UNION ALL
       SELECT 'admin-' || a.id, a.category, a.action, a.entry_id, a.entry_email,
              a.actor_user_id, a.actor_username, a.created_at,
              a.old_values, a.new_values, COALESCE(a.details, '{}'::jsonb), NULL::bigint,
              FALSE, FALSE, FALSE, FALSE, NULL::text, NULL::bigint
       FROM projectm_itune_admin_log a
     )
     SELECT *, COUNT(*) OVER() AS total_count FROM history
     ${where}
     ORDER BY occurred_at DESC, source_key DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );
  return {
    events: result.rows.map((row) => ({
      id: row.source_key,
      category: row.category,
      action: row.action,
      entryId: row.entry_id,
      entryEmail: row.entry_email || "",
      actorUserId: row.actor_user_id || null,
      actorUsername: row.actor_username || "",
      occurredAt: row.occurred_at,
      oldValues: row.old_values || {},
      newValues: row.new_values || {},
      details: row.details || {},
      claimLogId: row.claim_log_id ? Number(row.claim_log_id) : null,
      canConfirm: row.can_confirm,
      canDecline: row.can_decline,
      canCancel: row.can_cancel,
      imageUrl: row.has_image
        ? row.image_kind === "amount"
          ? `/api/projectm/itune/amount-log/${row.image_id}/image`
          : `/api/projectm/itune/claim-session/${row.image_id}/image`
        : null,
    })),
    page: safePage,
    pageSize: safePageSize,
    total: Number(result.rows[0]?.total_count || 0),
  };
}

export async function getItuneClaimSessionImage(sessionId) {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT proof_image FROM projectm_itune_claim_sessions WHERE id = $1`,
    [sessionId]
  );
  if (!result.rows.length) throw createHttpError("ไม่พบรูปหลักฐาน", 404);
  return result.rows[0].proof_image || "";
}

// "ตั้งเป็นเมลถาวร" / "ตั้งกลับเป็นเมลปกติ" — a standing admin override,
// independent of Amount/status, that exempts this row's countdown from
// counting at all (see ItuneCountdownCell's `frozen` prop). A plain toggle,
// not a log — unlike the amount/issue history, there's nothing an admin
// would need to audit here beyond the current on/off state.
export async function setItuneEntryPermanent(id, isPermanent, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, email, is_permanent FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const row = result.rows[0];
    if (!row) throw createHttpError("ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)", 404);
    const next = Boolean(isPermanent);
    if (row.is_permanent !== next) {
      await client.query(
        `UPDATE projectm_itune_entries SET is_permanent = $1, updated_at = NOW() WHERE id = $2`,
        [next, id]
      );
      await insertAdminLog(client, {
        category: "system",
        action: next ? "permanent_enable" : "permanent_disable",
        actor,
        entryId: row.id,
        entryEmail: row.email,
        oldValues: { isPermanent: row.is_permanent },
        newValues: { isPermanent: next },
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  publishItuneQueueChanged();
  return entry;
}

// Every non-admin, logged-in GameDB user can use the topup self-service
// claim flow (see /projectm/[lang]/itune/topup) — there's no separate
// "topup role" gate anywhere in this app (see requireAdmin in
// src/server/auth.js: it's just "any valid session"), so a projectm-admin
// actor is simply one whose projectmRole already happens to be "admin".
// Checked inline here rather than via a passed-in flag so every caller gets
// the same rule for free.
function isProjectmAdminActor(actor) {
  return actor?.projectmRole === "admin";
}

const MAX_CLAIMS_PER_USER = 2;
const ITUNE_CLAIM_LOCK_NAMESPACE = 0x4954554e; // "ITUN"

// "รับเมล" (claim) — assigns the first row in CLAIM_ORDER_SQL's order (an
// admin's manual pin if there is one, otherwise the oldest entry in the
// highest-value tier) that's neither already claimed, reported unavailable
// (see ITUNE_UNAVAILABLE_STATUS — a topup user should never be handed a
// card someone's already flagged broken), individually held back by an
// admin (claim_hold), nor the subject of a CONFIRMED reject by this
// specific actor (see rejectItuneEntry/confirmItuneReject — a pending,
// not-yet-confirmed reject request doesn't exclude anyone yet; once
// confirmed it's a permanent, per-user-only exclusion — everyone else can
// still claim the entry normally) to actor, capped at MAX_CLAIMS_PER_USER
// concurrent claims. FOR UPDATE SKIP LOCKED so two topup users clicking
// "รับเมล" at the same instant can't both land on the same row — the second
// just skips past it to the next candidate instead of blocking on the
// first's lock.
export async function claimItuneEntry(actor) {
  // Read before opening the transaction: both values are plain settings,
  // and a paused queue should fail before taking any row locks at all.
  const {
    claimPaused,
    maxAmount,
    targetHours,
    burnRateUsdPerHour,
    expectedIdleHours,
  } = await getItuneClaimSettings();
  if (claimPaused) {
    throw createHttpError("ระบบหยุดรับเมลชั่วคราว — ติดต่อแอดมิน", 423);
  }
  const pool = await getReadyPool();
  const client = await pool.connect();
  let claimedId;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [
      ITUNE_CLAIM_LOCK_NAMESPACE,
      actor.id,
    ]);
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM projectm_itune_entries WHERE claimed_by_user_id = $1`,
      [actor.id]
    );
    if (countRows[0].count >= MAX_CLAIMS_PER_USER) {
      throw createHttpError(
        `รับได้สูงสุด ${MAX_CLAIMS_PER_USER} เมล — คืนเมลที่ถืออยู่ก่อนถึงจะรับเพิ่มได้`,
        400
      );
    }
    const { rows } = await client.query(
      `SELECT id, email, amount, amount_confirm_image FROM projectm_itune_entries e
       WHERE ${CLAIMABLE_WHERE_SQL}
         AND claim_hold = FALSE
         AND NOT EXISTS (
           SELECT 1 FROM projectm_itune_issue_log l
           WHERE l.entry_id = e.id AND l.is_reject AND l.reject_confirmed_at IS NOT NULL
             AND l.reported_by_user_id = $6
         )
       ${CLAIM_ORDER_SQL}
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [
        ITUNE_UNAVAILABLE_STATUS,
        maxAmount,
        targetHours,
        burnRateUsdPerHour,
        expectedIdleHours,
        actor.id,
      ]
    );
    if (rows.length === 0) {
      throw createHttpError("ไม่มีรายการว่างให้รับตอนนี้", 404);
    }
    const claimedRow = rows[0];
    claimedId = claimedRow.id;
    // priority_order is cleared on the way out: a pin means "hand this one
    // out next", and it has now been handed out. Leaving it set would put
    // the row back at the head of the queue if it's ever released, ahead of
    // entries that have been waiting since — the admin can always re-pin it
    // from the priority page if that's actually what they want.
    const sessionResult = await client.query(
      `INSERT INTO projectm_itune_claim_sessions
         (entry_id, entry_email, user_id, username, start_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id AS pk`,
      [
        claimedId,
        claimedRow.email || null,
        actor?.id ?? null,
        actor?.displayName || actor?.username || null,
        Number(claimedRow.amount || 0),
      ]
    );
    const sessionId = sessionResult.rows[0]?.pk ?? null;
    await client.query(
      `UPDATE projectm_itune_entries
       SET claimed_by_user_id = $1, claimed_at = NOW(), priority_order = NULL
       WHERE id = $2`,
      [actor.id, claimedId]
    );
    if (sessionId !== null) {
      await client.query(
        `UPDATE projectm_itune_entries SET active_claim_session_id = $1 WHERE id = $2`,
        [sessionId, claimedId]
      );
    }
    // Baseline history row — old_amount = new_amount marks it as "this is
    // where the balance stood when the claim started", not a real
    // adjustment (see listItuneAmountLog's callers for how that's told
    // apart from a genuine change).
    const startingAmount = claimedRow.amount === null ? 0 : Number(claimedRow.amount);
    await client.query(
      `INSERT INTO projectm_itune_amount_log
         (entry_id, entry_email, old_amount, new_amount, image, changed_by_user_id, changed_by_username)
       VALUES ($1, $2, $3, $3, $4, $5, $6)`,
      [
        claimedId,
        claimedRow.email || null,
        startingAmount,
        claimedRow.amount_confirm_image || null,
        actor?.id ?? null,
        actor?.displayName || actor?.username || null,
      ]
    );
    await insertClaimLog(client, {
      entryId: claimedId,
      entryEmail: claimedRow.email,
      action: "claim",
      actor,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(claimedId);
  publishItuneQueueChanged();
  return entry;
}

// The admin "จัดคิวรับเมล" page's list: every entry that's up for grabs,
// in exactly the order claimItuneEntry will hand them out, plus the ones an
// admin has individually held back (returned too, flagged via claimHold, so
// they can be un-held from the same screen rather than disappearing).
//
// Deliberately does NOT apply claimItuneEntry's per-user "you already had
// this one rejected" exclusion: that rule differs for every caller, so
// there is no single true queue to show. This is the queue as a user with
// no confirmed rejects would see it — the page says as much on screen.
export async function listItunePriorityQueue() {
  const pool = await getReadyPool();
  const {
    maxAmount,
    targetHours,
    burnRateUsdPerHour,
    expectedIdleHours,
  } = await getItuneClaimSettings();
  const result = await pool.query(
    `SELECT e.*, ${HAS_PENDING_REJECT_SQL},
            EXTRACT(EPOCH FROM (NOW() - added_at)) / 3600 AS known_age_hours,
            ${COMPLETION_SLACK_SQL} AS completion_slack_hours
     FROM projectm_itune_entries e
     WHERE ${CLAIMABLE_WHERE_SQL}
     ${CLAIM_ORDER_SQL}`,
    [
      ITUNE_UNAVAILABLE_STATUS,
      maxAmount,
      targetHours,
      burnRateUsdPerHour,
      expectedIdleHours,
    ]
  );
  const usernamesById = await fetchUsernamesById(
    result.rows.map((row) => row.created_by_user_id)
  );
  return result.rows.map((row) => mapRow(row, usernamesById));
}

// Persists the admin's drag-to-reorder of the pinned zone. Mirrors
// reorderGameListRows in gameinfo-gamelist.js: one transaction, one UPDATE
// per row, position taken from the array index. Only ids the caller listed
// are touched — unpinned entries keep priority_order NULL and stay on the
// automatic rule.
export async function reorderItunePriority(orderedIds, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(
      `SELECT id, priority_order FROM projectm_itune_entries
       WHERE id = ANY($1::int[]) FOR UPDATE`,
      [orderedIds]
    );
    for (const [index, id] of orderedIds.entries()) {
      await client.query(
        `UPDATE projectm_itune_entries SET priority_order = $1, updated_at = NOW() WHERE id = $2`,
        [index, id]
      );
    }
    await insertAdminLog(client, {
      category: "system",
      action: "priority_reorder",
      actor,
      oldValues: {
        orderedIds: before.rows
          .sort((a, b) => Number(a.priority_order) - Number(b.priority_order))
          .map((row) => row.id),
      },
      newValues: { orderedIds },
      details: { count: orderedIds.length },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  publishItuneQueueChanged();
}

// Pin an entry to the manual queue (appended after whatever is already
// pinned) or release it back to the automatic rule. MAX(priority_order)+1
// is computed in the same statement so two admins pinning at once can't
// both land on the same slot.
export async function setItunePriorityPinned(id, pinned, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT id, email, priority_order FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw createHttpError("ไม่พบรายการนี้", 404);
    const nextPinned = Boolean(pinned);
    const wasPinned = current.priority_order !== null;
    if (wasPinned !== nextPinned) {
      const updated = nextPinned
        ? await client.query(
            `UPDATE projectm_itune_entries
             SET priority_order = COALESCE(
                   (SELECT MAX(priority_order) + 1 FROM projectm_itune_entries), 0
                 ), updated_at = NOW()
             WHERE id = $1 RETURNING priority_order`,
            [id]
          )
        : await client.query(
            `UPDATE projectm_itune_entries SET priority_order = NULL, updated_at = NOW()
             WHERE id = $1 RETURNING priority_order`,
            [id]
          );
      await insertAdminLog(client, {
        category: "system",
        action: nextPinned ? "priority_pin" : "priority_unpin",
        actor,
        entryId: current.id,
        entryEmail: current.email,
        oldValues: { priorityOrder: current.priority_order },
        newValues: { priorityOrder: updated.rows[0].priority_order },
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  publishItuneQueueChanged();
  return entry;
}

// Per-entry counterpart to the global claim_paused switch — takes one row
// out of the claimable pool without touching its status or its pin.
export async function setItuneClaimHold(id, hold, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, email, claim_hold FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const row = result.rows[0];
    if (!row) throw createHttpError("ไม่พบรายการนี้", 404);
    const next = Boolean(hold);
    if (row.claim_hold !== next) {
      await client.query(
        `UPDATE projectm_itune_entries SET claim_hold = $1, updated_at = NOW() WHERE id = $2`,
        [next, id]
      );
      await insertAdminLog(client, {
        category: "system",
        action: next ? "claim_hold" : "claim_unhold",
        actor,
        entryId: row.id,
        entryEmail: row.email,
        oldValues: { claimHold: row.claim_hold },
        newValues: { claimHold: next },
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  publishItuneQueueChanged();
  return entry;
}

// Rows currently held by a given topup user — what the topup page loads on
// open so a user's in-progress claims survive a refresh/re-login instead of
// only living in client state.
export async function listClaimedItuneEntriesForUser(userId) {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT e.*, ${HAS_PENDING_REJECT_SQL} FROM projectm_itune_entries e
     WHERE claimed_by_user_id = $1 ORDER BY id ASC`,
    [userId]
  );
  const usernamesById = await fetchUsernamesById(
    result.rows.flatMap((r) => [r.created_by_user_id, r.claimed_by_user_id])
  );
  return result.rows.map((row) => mapRow(row, usernamesById));
}

// "ปัจจุบัน" (live) tab of the admin topup log — every entry currently held
// by anyone, across all users (unlike listClaimedItuneEntriesForUser, which
// is scoped to one user's own topup page). Just reads the entries table's
// own claimed_by_user_id/claimed_at — no separate log needed since "who
// holds what right now" is exactly what that column already means.
export async function listClaimedItuneEntries() {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT * FROM projectm_itune_entries WHERE claimed_by_user_id IS NOT NULL ORDER BY claimed_at ASC`
  );
  const usernamesById = await fetchUsernamesById(
    result.rows.flatMap((r) => [r.created_by_user_id, r.claimed_by_user_id])
  );
  return result.rows.map((row) => mapRow(row, usernamesById));
}

// "ประวัติ" (history) tab of the admin topup log — every claim/release/
// reject/reject_confirm/reject_decline/cancel_reject ever logged (see
// insertClaimLog), newest first. The join against the linked issue_log row
// tells each row its current pending/confirmed/declined state (live, not
// frozen at the moment it was logged), which is what drives which action
// button (if any) itune-topup-log.js renders per row:
//   - canConfirm/canDecline: this is the original 'reject' request row, and
//     it's still pending (is_reject true, reject_confirmed_at still null).
//   - canCancel: this is the 'reject_confirm' row, and it's still in effect
//     (is_reject true — cancelItuneReject clears it, which flips this back
//     to false without needing to touch anything else in this query).
export async function listItuneClaimLog({ limit = 200 } = {}) {
  const pool = await getReadyPool();
  const cappedLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  const result = await pool.query(
    `SELECT c.*, i.is_reject AS issue_is_reject, i.reject_confirmed_at AS issue_reject_confirmed_at
     FROM projectm_itune_claim_log c
     LEFT JOIN projectm_itune_issue_log i ON i.id = c.issue_log_id
     ORDER BY c.id DESC LIMIT $1`,
    [cappedLimit]
  );
  return result.rows.map((row) => {
    const pending = row.issue_is_reject === true && row.issue_reject_confirmed_at === null;
    const confirmed = row.issue_is_reject === true && row.issue_reject_confirmed_at !== null;
    return {
      id: row.id,
      entryId: row.entry_id,
      entryEmail: row.entry_email || "",
      action: row.action,
      userId: row.user_id,
      username: row.username || "",
      createdAt: row.created_at,
      canConfirm: row.action === "reject" && pending,
      canDecline: row.action === "reject" && pending,
      canCancel: row.action === "reject_confirm" && confirmed,
    };
  });
}

// Dev utility — wipes every *history* table (แจ้งปัญหา/reject log, amount
// adjustment log, claim/release/reject-workflow log) without touching
// projectm_itune_entries itself (the actual mail data — "การเพิ่มเมล") or
// projectm_itune_release_settings (a setting, not a log). Deliberately
// leaves any live status/other_notes/is_permanent/claimed_by_user_id on
// entries exactly as they are — this only clears the audit trail behind
// them, not current state, so a still-pending Reject or reported-unavailable
// entry stays exactly as visible/claimable as it was before running this.
export async function clearItuneLogs(actor, reason) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw createHttpError("กรุณาระบุเหตุผลที่ล้างประวัติ", 400);
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const deletes = [
      ["claimSessions", `DELETE FROM projectm_itune_claim_sessions WHERE released_at IS NOT NULL`],
      ["issueLogs", `DELETE FROM projectm_itune_issue_log i
        WHERE i.resolved_at IS NOT NULL OR (
          i.is_reject = FALSE AND EXISTS (
            SELECT 1 FROM projectm_itune_claim_log c WHERE c.issue_log_id = i.id
          )
        )`],
      ["claimLogs", `DELETE FROM projectm_itune_claim_log c
        WHERE c.issue_log_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM projectm_itune_issue_log i
          WHERE i.id = c.issue_log_id AND i.is_reject = TRUE
        )`],
      ["amountLogs", `DELETE FROM projectm_itune_amount_log`],
      ["entryLogs", `DELETE FROM projectm_itune_entry_log`],
    ];
    const counts = {};
    for (const [key, statement] of deletes) {
      const result = await client.query(statement);
      counts[key] = result.rowCount;
    }
    await insertAdminLog(client, {
      category: "admin",
      action: "history_clear",
      actor,
      details: { reason: cleanReason, counts },
    });
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Read side for the "คืนเมล" release threshold (see releaseItuneEntry).
// Falls back to DEFAULT_ITUNE_RELEASE_THRESHOLD if no row has been saved yet.
export async function getItuneReleaseThreshold() {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT max_amount FROM projectm_itune_release_settings WHERE id = 1`
  );
  const value = result.rows[0]?.max_amount;
  return value === undefined || value === null ? DEFAULT_ITUNE_RELEASE_THRESHOLD : Number(value);
}

export async function saveItuneReleaseThreshold(maxAmount, actor) {
  const pool = await getReadyPool();
  await pool.query(
    `INSERT INTO projectm_itune_release_settings (id, max_amount, updated_by_user_id, updated_by_username)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET max_amount = EXCLUDED.max_amount,
           updated_at = NOW(),
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_by_username = EXCLUDED.updated_by_username`,
    [maxAmount, actor?.id ?? null, actor?.displayName || actor?.username || null]
  );
  return maxAmount;
}

// Everything on the settings singleton in one read — claimItuneEntry needs
// two of these three on every claim, so splitting them into separate
// getters would just mean two round trips for one row.
export async function getItuneClaimSettings() {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT max_amount, claim_paused, priority_amount_threshold,
            target_hours, burn_rate_usd_per_hour, expected_idle_hours, claim_warning_hours
     FROM projectm_itune_release_settings WHERE id = 1`
  );
  return mapItuneClaimSettings(result.rows[0]);
}

function mapItuneClaimSettings(row) {
  const threshold = row?.priority_amount_threshold;
  return {
    maxAmount:
      row?.max_amount == null ? DEFAULT_ITUNE_RELEASE_THRESHOLD : Number(row.max_amount),
    claimPaused: row?.claim_paused || false,
    priorityAmountThreshold:
      threshold == null ? DEFAULT_ITUNE_PRIORITY_AMOUNT_THRESHOLD : Number(threshold),
    targetHours: row?.target_hours == null ? DEFAULT_ITUNE_TARGET_HOURS : Number(row.target_hours),
    burnRateUsdPerHour:
      row?.burn_rate_usd_per_hour == null
        ? DEFAULT_ITUNE_BURN_RATE
        : Number(row.burn_rate_usd_per_hour),
    expectedIdleHours:
      row?.expected_idle_hours == null
        ? DEFAULT_ITUNE_EXPECTED_IDLE_HOURS
        : Number(row.expected_idle_hours),
    claimWarningHours:
      row?.claim_warning_hours == null
        ? DEFAULT_ITUNE_CLAIM_WARNING_HOURS
        : Number(row.claim_warning_hours),
  };
}

// Partial update: omitted fields keep their current values.
export async function saveItuneClaimSettings(fields, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  let next;
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT max_amount, claim_paused, priority_amount_threshold,
              target_hours, burn_rate_usd_per_hour, expected_idle_hours, claim_warning_hours
       FROM projectm_itune_release_settings WHERE id = 1 FOR UPDATE`
    );
    const current = mapItuneClaimSettings(currentResult.rows[0]);
    next = {
      maxAmount: fields.maxAmount === undefined ? current.maxAmount : fields.maxAmount,
      claimPaused: fields.claimPaused === undefined ? current.claimPaused : Boolean(fields.claimPaused),
      priorityAmountThreshold: fields.priorityAmountThreshold === undefined
        ? current.priorityAmountThreshold
        : fields.priorityAmountThreshold,
      targetHours: fields.targetHours === undefined ? current.targetHours : fields.targetHours,
      burnRateUsdPerHour: fields.burnRateUsdPerHour === undefined
        ? current.burnRateUsdPerHour
        : fields.burnRateUsdPerHour,
      expectedIdleHours: fields.expectedIdleHours === undefined
        ? current.expectedIdleHours
        : fields.expectedIdleHours,
      claimWarningHours: fields.claimWarningHours === undefined
        ? current.claimWarningHours
        : fields.claimWarningHours,
    };
    const oldValues = {};
    const newValues = {};
    for (const key of Object.keys(next)) {
      if (current[key] === next[key]) continue;
      oldValues[key] = current[key];
      newValues[key] = next[key];
    }
    if (!Object.keys(newValues).length) {
      await client.query("COMMIT");
      return next;
    }
    await client.query(
      `INSERT INTO projectm_itune_release_settings
         (id, max_amount, claim_paused, priority_amount_threshold,
          target_hours, burn_rate_usd_per_hour, expected_idle_hours, claim_warning_hours,
          updated_by_user_id, updated_by_username)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
         SET max_amount = EXCLUDED.max_amount,
             claim_paused = EXCLUDED.claim_paused,
             priority_amount_threshold = EXCLUDED.priority_amount_threshold,
             target_hours = EXCLUDED.target_hours,
             burn_rate_usd_per_hour = EXCLUDED.burn_rate_usd_per_hour,
             expected_idle_hours = EXCLUDED.expected_idle_hours,
             claim_warning_hours = EXCLUDED.claim_warning_hours,
             updated_at = NOW(),
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_by_username = EXCLUDED.updated_by_username`,
      [
        next.maxAmount,
        next.claimPaused,
        next.priorityAmountThreshold,
        next.targetHours,
        next.burnRateUsdPerHour,
        next.expectedIdleHours,
        next.claimWarningHours,
        actor?.id ?? null,
        actor?.displayName || actor?.username || null,
      ]
    );
    await insertAdminLog(client, {
      category: "system",
      action: newValues.claimPaused === true
        ? "claim_pause"
        : newValues.claimPaused === false
          ? "claim_resume"
          : "settings_update",
      actor,
      oldValues,
      newValues,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  publishItuneQueueChanged();
  return next;
}

// Finishes one claim atomically. A normal user must submit the outcome,
// latest balance and fresh proof image. Admins may still force-release a
// stuck claim without details; that path is intentionally exceptional.
export async function releaseItuneEntry(id, actor, details = null) {
  const pool = await getReadyPool();
  const threshold = await getItuneReleaseThreshold();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT claimed_by_user_id, claimed_at, active_claim_session_id,
              amount, amount_confirm_image, email, password, currency,
              supplier, link_sms, qna, status
       FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      throw createHttpError("ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)", 404);
    }
    const row = rows[0];
    const isAdmin = isProjectmAdminActor(actor);
    if (!isAdmin && row.claimed_by_user_id !== actor.id) {
      throw createHttpError("คุณไม่ใช่ผู้รับเมลนี้", 403);
    }
    if (!row.claimed_by_user_id && !isAdmin) {
      throw createHttpError("เมลนี้ไม่ได้อยู่ระหว่างการใช้งาน", 400);
    }

    const forceRelease = isAdmin && !details?.outcome;
    let outcome = details?.outcome;
    let amount = Number(details?.amount);
    let image = String(details?.image || "").trim();
    const note = String(details?.note || "").trim();

    if (forceRelease) {
      outcome = "partial_release";
      amount = Number(row.amount || 0);
      image = row.amount_confirm_image || "";
    } else {
      if (!["depleted", "partial_release", "unusable"].includes(outcome)) {
        throw createHttpError("กรุณาเลือกผลลัพธ์การใช้งาน", 400);
      }
      if (!Number.isFinite(amount) || amount < 0) {
        throw createHttpError("Amount ต้องเป็นตัวเลขไม่ติดลบ", 400);
      }
      if (!image) {
        throw createHttpError("กรุณาแนบรูปยืนยันยอดล่าสุดก่อนคืนเมล", 400);
      }
      if (outcome === "depleted" && amount >= threshold) {
        throw createHttpError(
          `ยอดคงเหลือยังไม่ต่ำกว่า ${threshold} จึงถือว่ายังใช้ต่อได้ กรุณาเลือกคืนเข้าคิว`,
          400
        );
      }
      if (outcome === "partial_release" && amount < threshold) {
        throw createHttpError(
          `ยอดคงเหลือต่ำกว่า ${threshold} แล้ว กรุณาเลือกใช้หมดแล้ว`,
          400
        );
      }
      if (outcome === "unusable" && !note) {
        throw createHttpError("กรุณาระบุปัญหาที่พบ", 400);
      }
    }

    const oldAmount = Number(row.amount || 0);
    await client.query(
      `UPDATE projectm_itune_entries
       SET amount = $2,
           amount_confirm_image = $3,
           status = CASE WHEN $4 THEN $5 ELSE status END,
           other_notes = CASE WHEN $4 THEN $6 ELSE other_notes END,
           claimed_by_user_id = NULL,
           claimed_at = NULL,
           active_claim_session_id = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id, amount, image || null, outcome === "unusable", ITUNE_UNAVAILABLE_STATUS, note || null]
    );

    await client.query(
      `INSERT INTO projectm_itune_amount_log
         (entry_id, entry_email, old_amount, new_amount, image,
          changed_by_user_id, changed_by_username)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        row.email || null,
        oldAmount,
        amount,
        image || null,
        actor?.id ?? null,
        actor?.displayName || actor?.username || null,
      ]
    );

    const sessionValues = [
      amount,
      Math.max(0, oldAmount - amount),
      outcome,
      image || null,
      note || null,
    ];
    if (row.active_claim_session_id) {
      await client.query(
        `UPDATE projectm_itune_claim_sessions
         SET released_at = NOW(), end_amount = $1, amount_used = $2,
             outcome = $3, proof_image = $4, note = $5
         WHERE id = $6 AND released_at IS NULL`,
        [...sessionValues, row.active_claim_session_id]
      );
    } else {
      await client.query(
        `INSERT INTO projectm_itune_claim_sessions
           (entry_id, entry_email, user_id, username, claimed_at, released_at,
            start_amount, end_amount, amount_used, outcome, proof_image, note)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), NOW(),
                 $6, $7, $8, $9, $10, $11)`,
        [
          id,
          row.email || null,
          row.claimed_by_user_id || actor?.id || null,
          actor?.displayName || actor?.username || null,
          row.claimed_at,
          oldAmount,
          amount,
          Math.max(0, oldAmount - amount),
          outcome,
          image || null,
          note || null,
        ]
      );
    }

    if (outcome === "unusable") {
      await client.query(
        `INSERT INTO projectm_itune_issue_log
           (entry_id, entry_email, entry_password, entry_currency, entry_supplier,
            entry_amount, entry_link_sms, entry_qna, note,
            reported_by_user_id, reported_by_username)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          row.email || null,
          row.password || null,
          row.currency || null,
          row.supplier || null,
          amount,
          row.link_sms || null,
          row.qna || null,
          note,
          actor?.id ?? null,
          actor?.displayName || actor?.username || null,
        ]
      );
    }

    await insertClaimLog(client, {
      entryId: id,
      entryEmail: row.email,
      action: "release",
      actor,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  publishItuneQueueChanged();
  return entry;
}

// Balance adjustments while a claim is still active.
export async function updateItuneEntryAmount(id, { amount, image }, actor) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT email, amount, claimed_by_user_id FROM projectm_itune_entries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      throw createHttpError("ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)", 404);
    }
    const row = rows[0];
    if (!isProjectmAdminActor(actor) && row.claimed_by_user_id !== actor.id) {
      throw createHttpError("คุณไม่ใช่ผู้รับเมลนี้", 403);
    }
    const oldAmount = row.amount === null ? 0 : Number(row.amount);
    // A changed balance needs fresh proof — the old confirm image only ever
    // confirmed the old balance. Only enforced when the number actually
    // moves, so re-saving the same amount (or attaching an image with no
    // amount change) doesn't require one.
    if (Number(amount) !== oldAmount && !image) {
      throw createHttpError("ยอดมีการเปลี่ยนแปลง กรุณาแนบรูปยืนยันยอดใหม่", 400);
    }
    const sets = ["amount = $1", "updated_at = NOW()"];
    const values = [amount];
    let i = 2;
    if (image !== undefined) {
      sets.push(`amount_confirm_image = $${i++}`);
      values.push(image || null);
    }
    values.push(id);
    await client.query(`UPDATE projectm_itune_entries SET ${sets.join(", ")} WHERE id = $${i}`, values);
    await client.query(
      `INSERT INTO projectm_itune_amount_log
         (entry_id, entry_email, old_amount, new_amount, image, changed_by_user_id, changed_by_username)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        row.email || null,
        oldAmount,
        amount,
        image || null,
        actor?.id ?? null,
        actor?.displayName || actor?.username || null,
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const entry = await findItuneEntryById(id);
  publishItuneQueueChanged();
  return entry;
}

// Read side for the amount-adjustment history shown inside an expanded
// topup card — newest first, same idea as listItuneIssueLog.
export async function listItuneAmountLog(entryId, actor) {
  const pool = await getReadyPool();
  if (!isProjectmAdminActor(actor)) {
    const ownership = await pool.query(
      `SELECT 1 FROM projectm_itune_entries
       WHERE id = $1 AND claimed_by_user_id = $2`,
      [entryId, actor?.id]
    );
    if (!ownership.rows.length) {
      throw createHttpError("คุณไม่มีสิทธิ์ดูประวัติยอดของรายการนี้", 403);
    }
  }
  const result = await pool.query(
    `SELECT id, old_amount, new_amount, changed_by_username, changed_at,
            (image IS NOT NULL AND image <> '') AS has_image
     FROM projectm_itune_amount_log
     WHERE entry_id = $1 ORDER BY id DESC LIMIT 100`,
    [entryId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    oldAmount: Number(row.old_amount),
    newAmount: Number(row.new_amount),
    hasImage: row.has_image || false,
    changedByUsername: row.changed_by_username || "",
    changedAt: row.changed_at,
  }));
}

export async function getItuneAmountLogImage(logId, actor) {
  const numericId = Number(logId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw createHttpError("ไม่พบรูปยืนยัน", 404);
  }

  const pool = await getReadyPool();
  const result = isProjectmAdminActor(actor)
    ? await pool.query(
        `SELECT image FROM projectm_itune_amount_log WHERE id = $1`,
        [numericId]
      )
    : await pool.query(
        `SELECT l.image
         FROM projectm_itune_amount_log l
         JOIN projectm_itune_entries e ON e.id = l.entry_id
         WHERE l.id = $1 AND e.claimed_by_user_id = $2`,
        [numericId, actor?.id]
      );

  if (!result.rows.length) throw createHttpError("ไม่พบรูปยืนยัน", 404);
  return result.rows[0].image || "";
}

function percentile(values, ratio) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export async function getItuneStats({ days = 30 } = {}) {
  const pool = await getReadyPool();
  const settings = await getItuneClaimSettings();
  const safeDays = Math.min(90, Math.max(7, Number(days) || 30));
  const [overviewResult, sessionResult, dailyResult, userResult, bandResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE added_at >= CURRENT_DATE) AS emails_added_today,
         COALESCE(SUM(amount) FILTER (
           WHERE (status IS NULL OR status <> $1)
             AND amount >= $2
         ), 0) AS usable_stock,
         COALESCE(SUM(amount) FILTER (WHERE claimed_by_user_id IS NOT NULL), 0) AS held_stock,
         COUNT(*) FILTER (WHERE claimed_by_user_id IS NOT NULL) AS held_count,
         COUNT(*) FILTER (
           WHERE claimed_by_user_id IS NULL
             AND (status IS NULL OR status <> $1)
             AND amount >= $2
         ) AS queue_count,
         COUNT(*) FILTER (WHERE status = $1) AS unusable_count
       FROM projectm_itune_entries`,
      [ITUNE_UNAVAILABLE_STATUS, settings.maxAmount]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE released_at >= CURRENT_DATE) AS sessions_today,
         COALESCE(SUM(amount_used) FILTER (WHERE released_at >= CURRENT_DATE), 0) AS used_today,
         COUNT(*) FILTER (WHERE released_at >= CURRENT_DATE AND outcome = 'depleted') AS depleted_today,
         COUNT(*) FILTER (WHERE released_at >= CURRENT_DATE AND outcome = 'partial_release') AS partial_today,
         COUNT(*) FILTER (WHERE released_at >= CURRENT_DATE AND outcome = 'unusable') AS unusable_today,
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (released_at - claimed_at)) / 3600
         ) FILTER (WHERE released_at IS NOT NULL) AS hold_p50,
         percentile_cont(0.75) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (released_at - claimed_at)) / 3600
         ) FILTER (WHERE released_at IS NOT NULL) AS hold_p75,
         percentile_cont(0.9) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (released_at - claimed_at)) / 3600
         ) FILTER (WHERE released_at IS NOT NULL) AS hold_p90
       FROM projectm_itune_claim_sessions`
    ),
    pool.query(
      `SELECT released_at::date AS day, COUNT(*) AS sessions,
              COALESCE(SUM(amount_used), 0) AS amount_used,
              AVG(EXTRACT(EPOCH FROM (released_at - claimed_at)) / 3600) AS avg_hold_hours
       FROM projectm_itune_claim_sessions
       WHERE released_at >= CURRENT_DATE - ($1::int - 1)
       GROUP BY released_at::date ORDER BY day ASC`,
      [safeDays]
    ),
    pool.query(
      `SELECT COALESCE(username, 'ไม่ทราบชื่อ') AS username,
              COUNT(*) AS sessions, COALESCE(SUM(amount_used), 0) AS amount_used,
              AVG(EXTRACT(EPOCH FROM (released_at - claimed_at)) / 3600) AS avg_hold_hours,
              COUNT(*) FILTER (WHERE outcome = 'partial_release') AS partial_count
       FROM projectm_itune_claim_sessions
       WHERE released_at >= CURRENT_DATE - ($1::int - 1)
       GROUP BY COALESCE(username, 'ไม่ทราบชื่อ')
       ORDER BY amount_used DESC LIMIT 20`,
      [safeDays]
    ),
    pool.query(
      `SELECT CASE
                WHEN start_amount < 300 THEN '200–299'
                WHEN start_amount <= 500 THEN '300–500'
                ELSE 'มากกว่า 500'
              END AS band,
              COUNT(*) AS sessions, COALESCE(SUM(amount_used), 0) AS amount_used,
              AVG(EXTRACT(EPOCH FROM (released_at - claimed_at)) / 3600) AS avg_hold_hours,
              COUNT(*) FILTER (WHERE outcome = 'depleted') AS depleted_count
       FROM projectm_itune_claim_sessions
       WHERE released_at >= CURRENT_DATE - ($1::int - 1)
       GROUP BY 1 ORDER BY MIN(start_amount)`,
      [safeDays]
    ),
  ]);

  const overviewRow = overviewResult.rows[0] || {};
  const sessionRow = sessionResult.rows[0] || {};
  const daily = dailyResult.rows.map((row) => ({
    day: row.day,
    sessions: Number(row.sessions || 0),
    amountUsed: Number(row.amount_used || 0),
    avgHoldHours: Number(row.avg_hold_hours || 0),
  }));
  const bands = bandResult.rows.map((row) => ({
    band: row.band,
    sessions: Number(row.sessions || 0),
    amountUsed: Number(row.amount_used || 0),
    avgHoldHours: Number(row.avg_hold_hours || 0),
    depletedCount: Number(row.depleted_count || 0),
  }));
  const sufficientlySampled = bands.filter((band) => band.sessions >= 5);
  const bandCandidates = sufficientlySampled.length ? sufficientlySampled : bands;
  const preferredBand = [...bandCandidates].sort((a, b) => {
    const aRate = a.sessions ? a.depletedCount / a.sessions : 0;
    const bRate = b.sessions ? b.depletedCount / b.sessions : 0;
    return bRate - aRate || a.avgHoldHours - b.avgHoldHours;
  })[0];
  const preferredAmountPerEmail =
    { "200–299": 250, "300–500": 400, "มากกว่า 500": 600 }[preferredBand?.band] || 350;

  const dailyAmounts = daily.map((row) => row.amountUsed);
  const demandP75 = percentile(dailyAmounts, 0.75);
  const demandP90 = percentile(dailyAmounts, 0.9);
  const usableStock = Number(overviewRow.usable_stock || 0);
  const safetyStock = demandP90 * 0.1;
  const recommendedDailyAmount = Math.max(0, demandP75 + safetyStock - usableStock);

  return {
    settings,
    periodDays: safeDays,
    overview: {
      emailsAddedToday: Number(overviewRow.emails_added_today || 0),
      usableStock,
      heldStock: Number(overviewRow.held_stock || 0),
      heldCount: Number(overviewRow.held_count || 0),
      queueCount: Number(overviewRow.queue_count || 0),
      unusableCount: Number(overviewRow.unusable_count || 0),
      sessionsToday: Number(sessionRow.sessions_today || 0),
      usedToday: Number(sessionRow.used_today || 0),
      depletedToday: Number(sessionRow.depleted_today || 0),
      partialToday: Number(sessionRow.partial_today || 0),
      unusableToday: Number(sessionRow.unusable_today || 0),
      holdP50: Number(sessionRow.hold_p50 || 0),
      holdP75: Number(sessionRow.hold_p75 || 0),
      holdP90: Number(sessionRow.hold_p90 || 0),
      hoursOfCover: usableStock / Math.max(settings.burnRateUsdPerHour, 0.01),
    },
    purchase: {
      demandP75,
      demandP90,
      safetyStock,
      recommendedDailyAmount,
      recommendedEmailCount: Math.ceil(recommendedDailyAmount / preferredAmountPerEmail),
      preferredAmountPerEmail,
      cutoffHour: 18,
    },
    daily,
    users: userResult.rows.map((row) => ({
      username: row.username,
      sessions: Number(row.sessions || 0),
      amountUsed: Number(row.amount_used || 0),
      avgHoldHours: Number(row.avg_hold_hours || 0),
      partialCount: Number(row.partial_count || 0),
    })),
    bands,
  };
}
