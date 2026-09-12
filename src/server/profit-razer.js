import { getPool } from "@/lib/db";
import { normalizeZone, parseRazerImportText, RAZER_ZONES } from "@/lib/profit-razer-parse";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { hasValidTfaSecret, normalizeTfaSecret } from "@/server/profit-razer-sync";

export { normalizeZone, RAZER_ZONES };
export const RAZER_STATUSES = ["PENDING_TOPUP", "SILVER_READY", "ACTIVE", "INACTIVE", "IN_USE"];

export function normalizeStatus(raw) {
  const upper = String(raw || "").trim().toUpperCase();
  return RAZER_STATUSES.includes(upper) ? upper : "PENDING_TOPUP";
}

export function normalizeTotpKey(raw) {
  return String(raw || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function suggestTotpKeyFromEmail(email) {
  const local = String(email || "").split("@")[0] || "";
  return normalizeTotpKey(local);
}

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_razer_accounts (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email           TEXT NOT NULL,
          password_enc    TEXT,
          tfa_secret      TEXT,
          zone            VARCHAR(16) NOT NULL DEFAULT 'OTHER',
          rate            NUMERIC NOT NULL DEFAULT 0,
          status          VARCHAR(32) NOT NULL DEFAULT 'PENDING_TOPUP',
          gold_balance    NUMERIC NOT NULL DEFAULT 0,
          silver_balance  NUMERIC NOT NULL DEFAULT 0,
          hidden          BOOLEAN NOT NULL DEFAULT false,
          bot_enabled     BOOLEAN NOT NULL DEFAULT true,
          last_synced_at  TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        ALTER TABLE profit_razer_accounts
        ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT true
      `);
      await client.query(`
        ALTER TABLE profit_razer_accounts
        ADD COLUMN IF NOT EXISTS in_use_by TEXT
      `);
      await client.query(`
        ALTER TABLE profit_razer_accounts
        ADD COLUMN IF NOT EXISTS in_use_order_id TEXT
      `);
      await client.query(`
        ALTER TABLE profit_razer_accounts
        ADD COLUMN IF NOT EXISTS in_use_at TIMESTAMPTZ
      `);
      await client.query(`
        ALTER TABLE profit_razer_accounts
        ADD COLUMN IF NOT EXISTS totp_key TEXT
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_razer_accounts_zone_idx ON profit_razer_accounts (zone)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_razer_accounts_status_idx ON profit_razer_accounts (status)
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS profit_razer_accounts_email_lower_idx
          ON profit_razer_accounts (LOWER(email))
      `);
      await client.query(`
        UPDATE profit_razer_accounts
        SET totp_key = lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_-]', '', 'g')),
            updated_at = NOW()
        WHERE totp_key IS NULL OR btrim(totp_key) = ''
      `);
    } finally {
      client.release();
    }
  })();

  return schemaReady;
}

function rowToAccount(row, { includeSecrets = false } = {}) {
  if (!row) return null;
  const storedTotpKey = row.totp_key || "";
  const totpKey = storedTotpKey || suggestTotpKeyFromEmail(row.email);
  const otpApiEnabled = Boolean(
    (process.env.RAZER_OTP_API_KEY || "").trim()
    && (process.env.RAZER_OTP_API_URL || "").trim()
  );
  const account = {
    id: row.id,
    email: row.email,
    zone: row.zone,
    rate: Number(row.rate) || 0,
    status: row.status,
    goldBalance: Number(row.gold_balance) || 0,
    silverBalance: Number(row.silver_balance) || 0,
    goldThb: (Number(row.gold_balance) || 0) * (Number(row.rate) || 0),
    hidden: Boolean(row.hidden),
    botEnabled: row.bot_enabled !== false,
    inUseBy: row.in_use_by || null,
    inUseOrderId: row.in_use_order_id || null,
    inUseAt: row.in_use_at || null,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasPassword: Boolean(row.password_enc),
    totpKey,
    hasTotpKey: Boolean(totpKey),
    hasTfa: hasValidTfaSecret(row.tfa_secret),
    canFetchOtp: Boolean(totpKey) || hasValidTfaSecret(row.tfa_secret) || otpApiEnabled,
  };
  if (includeSecrets) {
    account.password = row.password_enc ? decryptSecret(row.password_enc) : "";
    account.tfaSecret = row.tfa_secret || "";
  }
  return account;
}

export async function listRazerAccounts({ zone, search, status } = {}) {
  await ensureSchema();
  const clauses = [];
  const params = [];

  if (zone && RAZER_ZONES.includes(zone)) {
    params.push(zone);
    clauses.push(`zone = $${params.length}`);
  }
  if (status && RAZER_STATUSES.includes(status)) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.trim().toLowerCase()}%`);
    clauses.push(`(LOWER(email) LIKE $${params.length} OR LOWER(zone) LIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await getPool().query(
    `SELECT * FROM profit_razer_accounts ${where} ORDER BY zone, email`,
    params
  );
  return rows.map((row) => rowToAccount(row));
}

export async function getRazerAccountByEmail(email, options) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM profit_razer_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [String(email || "").trim()]
  );
  return rowToAccount(rows[0], options);
}

export async function getRazerAccount(id, options) {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT * FROM profit_razer_accounts WHERE id = $1`, [id]);
  return rowToAccount(rows[0], options);
}

/** Another account already uses this 2FA secret — sharing one secret makes OTP identical. */
export async function findAccountWithDuplicateTfaSecret(secret, excludeId) {
  await ensureSchema();
  const norm = secret ? normalizeTfaSecret(secret) : "";
  if (!norm || !hasValidTfaSecret(norm)) return null;
  const { rows } = await getPool().query(
    `SELECT id, email, tfa_secret FROM profit_razer_accounts
     WHERE tfa_secret IS NOT NULL AND btrim(tfa_secret) <> '' AND id <> $1`,
    [excludeId]
  );
  for (const row of rows) {
    if (normalizeTfaSecret(row.tfa_secret) === norm) {
      return { id: row.id, email: row.email };
    }
  }
  return null;
}

export async function persistUniqueTfaSecret(accountId, secret) {
  const norm = secret ? normalizeTfaSecret(secret) : "";
  if (!norm || !hasValidTfaSecret(norm)) return { saved: false, duplicateOf: null };
  const dup = await findAccountWithDuplicateTfaSecret(norm, accountId);
  if (dup) return { saved: false, duplicateOf: dup };
  await updateRazerAccount(accountId, { tfaSecret: norm });
  return { saved: true, duplicateOf: null };
}

export async function createRazerAccount(data) {
  await ensureSchema();
  const email = String(data.email || "").trim();
  if (!email) throw Object.assign(new Error("กรุณาระบุอีเมล"), { status: 400 });

  const zone = normalizeZone(data.zone);
  const status = normalizeStatus(data.status);
  const rate = Number(data.rate) || 0;
  const goldBalance = Number(data.goldBalance ?? data.gold_balance) || 0;
  const silverBalance = Number(data.silverBalance ?? data.silver_balance) || 0;
  const password = data.password ? String(data.password) : "";
  const tfaRaw = data.tfaSecret ?? data.tfa_secret ?? "";
  const tfaSecret = tfaRaw ? normalizeTfaSecret(tfaRaw) : "";
  const totpKey = normalizeTotpKey(data.totpKey ?? data.totp_key ?? "") || suggestTotpKeyFromEmail(email);
  if (tfaSecret && !hasValidTfaSecret(tfaSecret)) {
    throw Object.assign(new Error("2FA Secret ไม่ถูกต้อง — ต้องเป็น Base32 จาก Google Authenticator"), { status: 400 });
  }

  const { rows } = await getPool().query(
    `INSERT INTO profit_razer_accounts
      (email, password_enc, tfa_secret, totp_key, zone, rate, status, gold_balance, silver_balance, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING *`,
    [
      email,
      password ? encryptSecret(password) : null,
      tfaSecret || null,
      totpKey || null,
      zone,
      rate,
      status,
      goldBalance,
      silverBalance,
    ]
  );
  return rowToAccount(rows[0]);
}

export async function updateRazerAccount(id, data) {
  await ensureSchema();
  const existing = await getRazerAccount(id);
  if (!existing) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });

  const fields = [];
  const params = [];

  if (data.email != null) {
    params.push(String(data.email).trim());
    fields.push(`email = $${params.length}`);
  }
  if (data.password != null && data.password !== "") {
    params.push(encryptSecret(String(data.password)));
    fields.push(`password_enc = $${params.length}`);
  }
  if (data.tfaSecret != null || data.tfa_secret != null) {
    const raw = data.tfaSecret ?? data.tfa_secret ?? "";
    const val = raw ? normalizeTfaSecret(raw) : "";
    if (val && !hasValidTfaSecret(val)) {
      throw Object.assign(new Error("2FA Secret ไม่ถูกต้อง — ต้องเป็น Base32 จาก Google Authenticator"), { status: 400 });
    }
    params.push(val || null);
    fields.push(`tfa_secret = $${params.length}`);
  }
  if (data.totpKey != null || data.totp_key != null) {
    const val = normalizeTotpKey(data.totpKey ?? data.totp_key ?? "");
    params.push(val || null);
    fields.push(`totp_key = $${params.length}`);
  }
  if (data.zone != null) {
    params.push(normalizeZone(data.zone));
    fields.push(`zone = $${params.length}`);
  }
  if (data.rate != null) {
    params.push(Number(data.rate) || 0);
    fields.push(`rate = $${params.length}`);
  }
  if (data.status != null) {
    params.push(normalizeStatus(data.status));
    fields.push(`status = $${params.length}`);
  }
  if (data.goldBalance != null || data.gold_balance != null) {
    params.push(Number(data.goldBalance ?? data.gold_balance) || 0);
    fields.push(`gold_balance = $${params.length}`);
  }
  if (data.silverBalance != null || data.silver_balance != null) {
    params.push(Number(data.silverBalance ?? data.silver_balance) || 0);
    fields.push(`silver_balance = $${params.length}`);
  }
  if (data.hidden != null) {
    params.push(Boolean(data.hidden));
    fields.push(`hidden = $${params.length}`);
  }
  if (data.botEnabled != null || data.bot_enabled != null) {
    params.push(Boolean(data.botEnabled ?? data.bot_enabled));
    fields.push(`bot_enabled = $${params.length}`);
  }
  if (data.inUseBy !== undefined || data.in_use_by !== undefined) {
    params.push(data.inUseBy ?? data.in_use_by ?? null);
    fields.push(`in_use_by = $${params.length}`);
  }
  if (data.inUseOrderId !== undefined || data.in_use_order_id !== undefined) {
    params.push(data.inUseOrderId ?? data.in_use_order_id ?? null);
    fields.push(`in_use_order_id = $${params.length}`);
  }
  if (data.inUseAt !== undefined || data.in_use_at !== undefined) {
    params.push(data.inUseAt ?? data.in_use_at ?? null);
    fields.push(`in_use_at = $${params.length}`);
  }
  if (data.clearInUse) {
    fields.push(`in_use_by = NULL`, `in_use_order_id = NULL`, `in_use_at = NULL`);
  }
  if (data.syncBalance) {
    fields.push(`last_synced_at = NOW()`);
  }

  if (!fields.length) return existing;

  params.push(id);
  fields.push(`updated_at = NOW()`);

  const { rows } = await getPool().query(
    `UPDATE profit_razer_accounts SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rowToAccount(rows[0]);
}

export async function deleteRazerAccount(id) {
  await ensureSchema();
  const { rowCount } = await getPool().query(`DELETE FROM profit_razer_accounts WHERE id = $1`, [id]);
  if (!rowCount) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });
}

export async function importRazerAccountsFromCsv(text) {
  await ensureSchema();
  const { rows: parsed, delimiter, skipped } = parseRazerImportText(text);
  if (!parsed.length) throw Object.assign(new Error("ไม่พบข้อมูลในไฟล์ — ตรวจรูปแบบ Email | Password | 2FA | Region | Rate"), { status: 400 });

  const results = { created: 0, updated: 0, errors: [], delimiter, skipped, accountIds: [] };
  for (const row of parsed) {
    try {
      const { rows } = await getPool().query(
        `SELECT id FROM profit_razer_accounts WHERE LOWER(email) = LOWER($1)`,
        [row.email]
      );
      if (rows[0]) {
        await updateRazerAccount(rows[0].id, {
          password: row.password || undefined,
          tfaSecret: row.tfaSecret || undefined,
          totpKey: row.totpKey || undefined,
          zone: row.zone,
          rate: row.rate,
          goldBalance: row.goldBalance,
          silverBalance: row.silverBalance,
        });
        results.updated += 1;
        results.accountIds.push(rows[0].id);
      } else {
        const created = await createRazerAccount(row);
        results.created += 1;
        results.accountIds.push(created.id);
      }
    } catch (err) {
      results.errors.push({ email: row.email, message: err.message });
    }
  }
  return results;
}

export async function markRazerAccountInUse(id, { botName, orderId, note } = {}) {
  await ensureSchema();
  const label = [botName, orderId, note].filter(Boolean).join(" · ") || "bot";

  // Atomic: only claim if NOT already IN_USE
  const { rows } = await getPool().query(
    `UPDATE profit_razer_accounts
     SET status = 'IN_USE',
         in_use_by = $1,
         in_use_order_id = $2,
         in_use_at = NOW(),
         updated_at = NOW()
     WHERE id = $3 AND (status <> 'IN_USE' OR in_use_by IS NULL)
     RETURNING *`,
    [label, orderId || null, id]
  );
  if (!rows.length) {
    const current = await getRazerAccount(id);
    if (!current) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });
    throw Object.assign(
      new Error(`บัญชีนี้กำลังถูกใช้โดย ${current.inUseBy || "bot อื่น"} (order: ${current.inUseOrderId || "-"})`),
      { status: 409 }
    );
  }
  return rowToAccount(rows[0]);
}

export async function releaseRazerAccountInUse(id, { status } = {}) {
  const account = await getRazerAccount(id);
  if (!account) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });
  const nextStatus = status && RAZER_STATUSES.includes(status) && status !== "IN_USE"
    ? status
    : account.goldBalance > 0
      ? "ACTIVE"
      : account.silverBalance >= 5000
        ? "SILVER_READY"
        : "PENDING_TOPUP";
  return updateRazerAccount(id, {
    status: nextStatus,
    clearInUse: true,
  });
}

export async function razerOverview() {
  await ensureSchema();
  const { rows: accounts } = await getPool().query(`SELECT * FROM profit_razer_accounts`);

  const totals = {
    accountCount: accounts.length,
    totalGold: 0,
    totalSilver: 0,
    totalGoldThb: 0,
  };

  const byZone = Object.fromEntries(RAZER_ZONES.map((z) => [z, { zone: z, accountCount: 0, gold: 0, silver: 0, goldThb: 0 }]));
  const byStatus = Object.fromEntries(RAZER_STATUSES.map((s) => [s, { status: s, accountCount: 0 }]));

  for (const row of accounts) {
    const gold = Number(row.gold_balance) || 0;
    const silver = Number(row.silver_balance) || 0;
    const rate = Number(row.rate) || 0;
    const goldThb = gold * rate;

    totals.totalGold += gold;
    totals.totalSilver += silver;
    totals.totalGoldThb += goldThb;

    const zone = RAZER_ZONES.includes(row.zone) ? row.zone : "OTHER";
    byZone[zone].accountCount += 1;
    byZone[zone].gold += gold;
    byZone[zone].silver += silver;
    byZone[zone].goldThb += goldThb;

    const status = RAZER_STATUSES.includes(row.status) ? row.status : "PENDING_TOPUP";
    byStatus[status].accountCount += 1;
  }

  return {
    totals,
    zones: RAZER_ZONES.map((z) => byZone[z]),
    statuses: RAZER_STATUSES.map((s) => byStatus[s]).filter((s) => s.accountCount > 0),
  };
}
