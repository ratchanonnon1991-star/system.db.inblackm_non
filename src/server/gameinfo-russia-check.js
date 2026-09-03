import { createHash } from "node:crypto";
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";
import { decryptRussiaCheckSession, encryptRussiaCheckSession } from "@/server/crypto";
import { getRussiaCheckSourceAvailability } from "@/lib/gameinfo-russia-check-source";
import { getRussiaCheckDailyLog } from "@/server/gameinfo-russia-check-daily";
import { fetchInfoldCatalog } from "@/server/gameinfo-infold-catalog";
import { fetchMidasbuyCatalog } from "@/server/gameinfo-midasbuy-catalog";
import { fetchGryphlineCatalog } from "@/server/gameinfo-gryphline-catalog";
import { saveGryphlineSession } from "@/server/gameinfo-gryphline-session";
import { saveInfoldSession } from "@/server/gameinfo-infold-session";
import {
  RUSSIA_CHECK_PAGE_SIZE,
  RUSSIA_CHECK_STATUSES,
  nextRussiaCheckRunAt,
  normalizeRussiaCheckCatalog,
  reconcileRussiaCheckCatalog,
} from "@/lib/gameinfo-russia-check";

const CONNECTION_NAME = "gameinfo";
const RUSSIA_CHECK_EVENT_TYPES = new Set(["added", "removed", "restored"]);
const runners = new Map();
const schemaReadyByConnection = new Map();

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function actorId(actor) {
  const id = Number(actor?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function optionalPositiveInt(value, label) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw httpError(`${label} ไม่ถูกต้อง`, 400);
  return number;
}

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find((item) => item.name.trim().toLowerCase() === CONNECTION_NAME);
  return match ? findConnectionWithSecret(match.id) : null;
}

async function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached?.cacheKey === cacheKey) return cached.promise;
  const promise = (async () => {
    const client = await getPoolForConnection(connection).connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gameinfo_russia_check_sources (
          id bigserial PRIMARY KEY, source_key varchar(64) NOT NULL UNIQUE, game_id integer NOT NULL,
          expected_game_name text NOT NULL, provider varchar(32) NOT NULL, source_url text NOT NULL,
          store_url text,
          project_id varchar(64) NOT NULL, country char(2) NOT NULL DEFAULT 'RU', locale varchar(8) NOT NULL DEFAULT 'en',
          auth_required boolean NOT NULL DEFAULT false,
          enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE gameinfo_russia_check_sources ADD COLUMN IF NOT EXISTS store_url text;
        ALTER TABLE gameinfo_russia_check_sources ADD COLUMN IF NOT EXISTS auth_required boolean NOT NULL DEFAULT false;
        ALTER TABLE gameinfo_russia_check_sources ADD COLUMN IF NOT EXISTS catalog_scope_hash varchar(64);
        CREATE TABLE IF NOT EXISTS gameinfo_russia_check_source_credentials (
          source_id bigint PRIMARY KEY REFERENCES gameinfo_russia_check_sources(id) ON DELETE CASCADE,
          session_enc text NOT NULL, expires_at timestamptz, updated_by integer,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE gameinfo_russia_check_source_credentials ADD COLUMN IF NOT EXISTS credential_kind varchar(16) NOT NULL DEFAULT 'cookie';
        ALTER TABLE gameinfo_russia_check_source_credentials ADD COLUMN IF NOT EXISTS verified_at timestamptz;
        ALTER TABLE gameinfo_russia_check_source_credentials ADD COLUMN IF NOT EXISTS invalidated_at timestamptz;
        CREATE TABLE IF NOT EXISTS gameinfo_russia_check_runs (
          id bigserial PRIMARY KEY, target_game_id integer,
          trigger_type varchar(16) NOT NULL CHECK (trigger_type IN ('manual','scheduled')),
          status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','partial','failed')),
          requested_by integer, total_sources integer NOT NULL DEFAULT 0, completed_sources integer NOT NULL DEFAULT 0,
          failed_sources integer NOT NULL DEFAULT 0, added_count integer NOT NULL DEFAULT 0,
          pending_count integer NOT NULL DEFAULT 0, removed_count integer NOT NULL DEFAULT 0,
          restored_count integer NOT NULL DEFAULT 0, error text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz
        );
        CREATE UNIQUE INDEX IF NOT EXISTS gameinfo_russia_check_single_flight_idx
          ON gameinfo_russia_check_runs ((1)) WHERE status IN ('queued','running');
        CREATE TABLE IF NOT EXISTS gameinfo_russia_check_run_sources (
          run_id bigint NOT NULL REFERENCES gameinfo_russia_check_runs(id) ON DELETE CASCADE,
          source_id bigint NOT NULL REFERENCES gameinfo_russia_check_sources(id),
          status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
          item_count integer NOT NULL DEFAULT 0, added_count integer NOT NULL DEFAULT 0,
          pending_count integer NOT NULL DEFAULT 0, removed_count integer NOT NULL DEFAULT 0,
          restored_count integer NOT NULL DEFAULT 0, catalog_hash varchar(64) NOT NULL DEFAULT '', error text NOT NULL DEFAULT '',
          started_at timestamptz, finished_at timestamptz, PRIMARY KEY (run_id, source_id)
        );
        CREATE TABLE IF NOT EXISTS gameinfo_russia_check_items (
          source_id bigint NOT NULL REFERENCES gameinfo_russia_check_sources(id), sku text NOT NULL, name text NOT NULL,
          status varchar(24) NOT NULL CHECK (status IN ('active','pending_removal','removed')),
          missing_runs integer NOT NULL DEFAULT 0, is_baseline boolean NOT NULL DEFAULT false,
          first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
          activated_at timestamptz, removed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (source_id, sku)
        );
        CREATE INDEX IF NOT EXISTS gameinfo_russia_check_items_status_idx
          ON gameinfo_russia_check_items (source_id, status, name);
        CREATE TABLE IF NOT EXISTS gameinfo_russia_check_events (
          id bigserial PRIMARY KEY, run_id bigint NOT NULL REFERENCES gameinfo_russia_check_runs(id),
          source_id bigint NOT NULL REFERENCES gameinfo_russia_check_sources(id), sku text NOT NULL,
          pack_name text NOT NULL, event_type varchar(16) NOT NULL CHECK (event_type IN ('added','removed','restored')),
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS gameinfo_russia_check_events_time_idx
          ON gameinfo_russia_check_events (created_at DESC, id DESC);
        INSERT INTO gameinfo_russia_check_sources
          (source_key, game_id, expected_game_name, provider, source_url, store_url, project_id, country, locale)
        VALUES ('sky-xsolla-ru',139,'SKY CHILDREN','xsolla','https://store.xsolla.com/api/v2','https://store.thatskygame.com/','207830','RU','en')
        ON CONFLICT (source_key) DO UPDATE SET
          game_id=EXCLUDED.game_id, expected_game_name=EXCLUDED.expected_game_name, provider=EXCLUDED.provider,
          source_url=EXCLUDED.source_url, store_url=EXCLUDED.store_url, project_id=EXCLUDED.project_id, country=EXCLUDED.country,
          locale=EXCLUDED.locale, updated_at=now();
        INSERT INTO gameinfo_russia_check_sources
          (source_key,game_id,expected_game_name,provider,source_url,store_url,project_id,country,locale,auth_required,enabled)
        VALUES ('love-deepspace-infold',3,'LOVE AND DEEPSPACE','infold','https://loveanddeepspace.infoldgames.com/charge/en-EN','https://loveanddeepspace.infoldgames.com/charge/en-EN','love-and-deepspace','RU','en-EN',true,false)
        ON CONFLICT (source_key) DO UPDATE SET
          game_id=EXCLUDED.game_id,expected_game_name=EXCLUDED.expected_game_name,provider=EXCLUDED.provider,
          source_url=EXCLUDED.source_url,store_url=EXCLUDED.store_url,project_id=EXCLUDED.project_id,country=EXCLUDED.country,
          locale=EXCLUDED.locale,auth_required=true,updated_at=now();
        INSERT INTO gameinfo_russia_check_sources
          (source_key,game_id,expected_game_name,provider,source_url,store_url,project_id,country,locale,auth_required,enabled)
        VALUES ('nikke-midasbuy-th',22,'GODDESS OF VICTORY: NIKKE UID','midasbuy','https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query','https://www.midasbuy.com/midasbuy/th/shop/nikkegl#/pages/shop/items','1460000285','TH','en',false,true)
        ON CONFLICT (source_key) DO UPDATE SET
          game_id=EXCLUDED.game_id,expected_game_name=EXCLUDED.expected_game_name,provider=EXCLUDED.provider,
          source_url=EXCLUDED.source_url,store_url=EXCLUDED.store_url,project_id=EXCLUDED.project_id,country=EXCLUDED.country,
          locale=EXCLUDED.locale,auth_required=false,updated_at=now();
        INSERT INTO gameinfo_russia_check_sources
          (source_key,game_id,expected_game_name,provider,source_url,store_url,project_id,country,locale,auth_required,enabled)
        VALUES ('endfield-gryphline',217,'ARKNIGHTS: ENDFIELD','gryphline','https://as.gryphline.com/user/pay/v3/query_web_product','https://topup.gryphline.com/endfield','d9f6dbb6bbd6bb33','ZZ','en-us',true,false)
        ON CONFLICT (source_key) DO UPDATE SET
          game_id=EXCLUDED.game_id,expected_game_name=EXCLUDED.expected_game_name,provider=EXCLUDED.provider,
          source_url=EXCLUDED.source_url,store_url=EXCLUDED.store_url,project_id=EXCLUDED.project_id,country=EXCLUDED.country,
          locale=EXCLUDED.locale,auth_required=true,updated_at=now();
        INSERT INTO gameinfo_russia_check_sources
          (source_key,game_id,expected_game_name,provider,source_url,project_id,country,locale,enabled)
        VALUES ('demo-data',2147483647,'demo data','demo','internal://demo','demo','RU','en',false)
        ON CONFLICT (source_key) DO UPDATE SET
          expected_game_name=EXCLUDED.expected_game_name,provider=EXCLUDED.provider,enabled=false,updated_at=now();
        DO $$
        DECLARE demo_source_id bigint; demo_run_id bigint; demo_time timestamptz := now() - interval '1 day';
        BEGIN
          SELECT id INTO demo_source_id FROM gameinfo_russia_check_sources WHERE source_key='demo-data';
          SELECT rs.run_id INTO demo_run_id FROM gameinfo_russia_check_run_sources rs
            WHERE rs.source_id=demo_source_id ORDER BY rs.run_id LIMIT 1;
          IF demo_run_id IS NULL THEN
            INSERT INTO gameinfo_russia_check_runs
              (target_game_id,trigger_type,status,total_sources,completed_sources,added_count,removed_count,restored_count,created_at,started_at,finished_at)
            VALUES (2147483647,'manual','completed',1,1,1,1,1,demo_time,demo_time,demo_time + interval '1 minute')
            RETURNING id INTO demo_run_id;
            INSERT INTO gameinfo_russia_check_run_sources
              (run_id,source_id,status,item_count,added_count,removed_count,restored_count,started_at,finished_at)
            VALUES (demo_run_id,demo_source_id,'completed',20,6,4,3,demo_time,demo_time + interval '1 minute');
          END IF;
          INSERT INTO gameinfo_russia_check_items
            (source_id,sku,name,status,missing_runs,is_baseline,first_seen_at,last_seen_at,activated_at,removed_at)
          VALUES
            (demo_source_id,'demo-unchanged','Demo — Existing Pack','active',0,true,demo_time - interval '30 days',demo_time,null,null),
            (demo_source_id,'demo-daily-candle','Demo — Daily Candle Bundle','active',0,true,demo_time - interval '29 days',demo_time,null,null),
            (demo_source_id,'demo-starter-cape','Demo — Starter Cape Set','active',0,true,demo_time - interval '28 days',demo_time,null,null),
            (demo_source_id,'demo-friendship-gift','Demo — Friendship Gift','active',0,true,demo_time - interval '27 days',demo_time,null,null),
            (demo_source_id,'demo-traveler-bundle','Demo — Traveler Bundle','active',0,true,demo_time - interval '26 days',demo_time,null,null),
            (demo_source_id,'demo-seasonal-token','Demo — Seasonal Token Pack','active',0,true,demo_time - interval '25 days',demo_time,null,null),
            (demo_source_id,'demo-welcome-cosmetic','Demo — Welcome Cosmetic Set','active',0,true,demo_time - interval '24 days',demo_time,null,null),
            (demo_source_id,'demo-added','Demo — New Pack','active',0,false,demo_time,demo_time,demo_time + interval '10 seconds',null),
            (demo_source_id,'demo-aurora-wings','Demo — Aurora Wings Pack','active',0,false,demo_time,demo_time,demo_time + interval '11 seconds',null),
            (demo_source_id,'demo-moonlight-cape','Demo — Moonlight Cape Pack','active',0,false,demo_time,demo_time,demo_time + interval '12 seconds',null),
            (demo_source_id,'demo-starlight-accessory','Demo — Starlight Accessory Pack','active',0,false,demo_time,demo_time,demo_time + interval '13 seconds',null),
            (demo_source_id,'demo-festival-mask','Demo — Festival Mask Pack','active',0,false,demo_time,demo_time,demo_time + interval '14 seconds',null),
            (demo_source_id,'demo-cloud-companion','Demo — Cloud Companion Pack','active',0,false,demo_time,demo_time,demo_time + interval '15 seconds',null),
            (demo_source_id,'demo-pending','Demo — Pending Confirmation','pending_removal',1,true,demo_time - interval '20 days',demo_time - interval '1 day',null,null),
            (demo_source_id,'demo-sunset-outfit','Demo — Sunset Outfit Pack','pending_removal',1,true,demo_time - interval '19 days',demo_time - interval '1 day',null,null),
            (demo_source_id,'demo-forest-music','Demo — Forest Music Pack','pending_removal',1,true,demo_time - interval '18 days',demo_time - interval '1 day',null,null),
            (demo_source_id,'demo-removed','Demo — Removed Pack','removed',2,false,demo_time - interval '15 days',demo_time - interval '2 days',demo_time - interval '15 days',demo_time + interval '20 seconds'),
            (demo_source_id,'demo-winter-feast','Demo — Winter Feast Pack','removed',2,false,demo_time - interval '14 days',demo_time - interval '2 days',demo_time - interval '14 days',demo_time + interval '21 seconds'),
            (demo_source_id,'demo-ocean-call','Demo — Ocean Call Pack','removed',2,false,demo_time - interval '13 days',demo_time - interval '2 days',demo_time - interval '13 days',demo_time + interval '22 seconds'),
            (demo_source_id,'demo-lantern-celebration','Demo — Lantern Celebration Pack','removed',2,false,demo_time - interval '12 days',demo_time - interval '2 days',demo_time - interval '12 days',demo_time + interval '23 seconds')
          ON CONFLICT (source_id,sku) DO NOTHING;
          INSERT INTO gameinfo_russia_check_events (run_id,source_id,sku,pack_name,event_type,created_at)
          SELECT demo_run_id,demo_source_id,fixture.sku,fixture.pack_name,fixture.event_type,fixture.created_at
          FROM (VALUES
            ('demo-added','Demo — New Pack','added',demo_time + interval '10 seconds'),
            ('demo-aurora-wings','Demo — Aurora Wings Pack','added',demo_time + interval '11 seconds'),
            ('demo-moonlight-cape','Demo — Moonlight Cape Pack','added',demo_time + interval '12 seconds'),
            ('demo-starlight-accessory','Demo — Starlight Accessory Pack','added',demo_time + interval '13 seconds'),
            ('demo-festival-mask','Demo — Festival Mask Pack','added',demo_time + interval '14 seconds'),
            ('demo-cloud-companion','Demo — Cloud Companion Pack','added',demo_time + interval '15 seconds'),
            ('demo-removed','Demo — Removed Pack','removed',demo_time + interval '20 seconds'),
            ('demo-winter-feast','Demo — Winter Feast Pack','removed',demo_time + interval '21 seconds'),
            ('demo-ocean-call','Demo — Ocean Call Pack','removed',demo_time + interval '22 seconds'),
            ('demo-lantern-celebration','Demo — Lantern Celebration Pack','removed',demo_time + interval '23 seconds'),
            ('demo-restored-log','Demo — Returned Pack','restored',demo_time + interval '30 seconds'),
            ('demo-friendship-gift','Demo — Friendship Gift','restored',demo_time + interval '31 seconds'),
            ('demo-traveler-bundle','Demo — Traveler Bundle','restored',demo_time + interval '32 seconds')
          ) AS fixture(sku,pack_name,event_type,created_at)
          WHERE NOT EXISTS (
            SELECT 1 FROM gameinfo_russia_check_events e
            WHERE e.source_id=demo_source_id AND e.sku=fixture.sku AND e.event_type=fixture.event_type
          );
          UPDATE gameinfo_russia_check_run_sources SET item_count=20,added_count=6,removed_count=4,restored_count=3
          WHERE run_id=demo_run_id AND source_id=demo_source_id;
        END $$;
        INSERT INTO gameinfo_russia_check_events (run_id,source_id,sku,pack_name,event_type,created_at)
        SELECT first_run.run_id,i.source_id,i.sku,i.name,'added',i.first_seen_at
        FROM gameinfo_russia_check_items i
        JOIN gameinfo_russia_check_sources s ON s.id=i.source_id
        JOIN LATERAL (
          SELECT rs.run_id FROM gameinfo_russia_check_run_sources rs
          WHERE rs.source_id=i.source_id AND rs.status='completed' ORDER BY rs.run_id LIMIT 1
        ) first_run ON true
        WHERE i.is_baseline AND s.provider<>'demo' AND NOT EXISTS (
          SELECT 1 FROM gameinfo_russia_check_events e
          WHERE e.source_id=i.source_id AND e.sku=i.sku AND e.event_type='added'
        );
        UPDATE gameinfo_russia_check_items i SET activated_at=i.first_seen_at,updated_at=now()
        FROM gameinfo_russia_check_sources s
        WHERE s.id=i.source_id AND s.provider<>'demo' AND i.is_baseline AND i.activated_at IS NULL;
        UPDATE gameinfo_russia_check_run_sources rs SET added_count=events.added_count
        FROM (
          SELECT run_id,source_id,COUNT(*) FILTER (WHERE event_type='added')::int added_count
          FROM gameinfo_russia_check_events GROUP BY run_id,source_id
        ) events
        WHERE events.run_id=rs.run_id AND events.source_id=rs.source_id;
        UPDATE gameinfo_russia_check_runs r SET added_count=totals.added_count
        FROM (
          SELECT run_id,COALESCE(SUM(added_count),0)::int added_count
          FROM gameinfo_russia_check_run_sources GROUP BY run_id
        ) totals
        WHERE totals.run_id=r.id
      `);
    } finally {
      client.release();
    }
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

async function getPool() {
  const connection = await getGameinfoConnection();
  if (!connection) throw httpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

export function normalizeRussiaCheckSessionCookie(value) {
  const sessionCookie = String(value || "").trim();
  if (!sessionCookie || sessionCookie.length < 3) throw httpError("กรุณาใส่ Cookie ของ session", 400);
  if (sessionCookie.length > 16384) throw httpError("Cookie ยาวเกิน 16 KB", 400);
  if (/\r|\n/.test(sessionCookie)) throw httpError("Cookie ต้องอยู่ในบรรทัดเดียว", 400);
  if (!sessionCookie.includes("=")) throw httpError("รูปแบบ Cookie ไม่ถูกต้อง", 400);
  return sessionCookie;
}

function normalizeSessionExpiry(value) {
  if (value == null || value === "") return null;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) throw httpError("วันหมดอายุ session ไม่ถูกต้อง", 400);
  if (expiresAt <= new Date()) throw httpError("วันหมดอายุ session ต้องอยู่ในอนาคต", 400);
  return expiresAt;
}

export async function saveRussiaCheckSourceSession(sourceId, fields, actor) {
  const normalizedSourceId = optionalPositiveInt(sourceId, "Source ID");
  const pool = await getPool();
  const source = await pool.query(
    `SELECT id,expected_game_name,auth_required,provider FROM gameinfo_russia_check_sources WHERE id=$1`,
    [normalizedSourceId]
  );
  if (!source.rows[0]) throw httpError("ไม่พบ Source", 404);
  if (!source.rows[0].auth_required) throw httpError("Source นี้ไม่ต้องใช้ session", 409);
  if (source.rows[0].provider === "infold") return saveInfoldSession(pool, normalizedSourceId, fields, actor);
  if (source.rows[0].provider === "gryphline") return saveGryphlineSession(pool, normalizedSourceId, fields, actor);
  const sessionCookie = normalizeRussiaCheckSessionCookie(fields?.sessionCookie);
  const expiresAt = normalizeSessionExpiry(fields?.expiresAt);
  await pool.query(
    `INSERT INTO gameinfo_russia_check_source_credentials (source_id,session_enc,expires_at,updated_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (source_id) DO UPDATE SET session_enc=EXCLUDED.session_enc,expires_at=EXCLUDED.expires_at,
       updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
    [normalizedSourceId, encryptRussiaCheckSession(sessionCookie), expiresAt, actorId(actor)]
  );
  return { sourceId: normalizedSourceId, configured: true, expiresAt, expired: false, authState: "saved_unverified" };
}

export async function deleteRussiaCheckSourceSession(sourceId) {
  const normalizedSourceId = optionalPositiveInt(sourceId, "Source ID");
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM gameinfo_russia_check_sources WHERE id=$1 FOR UPDATE`, [normalizedSourceId]);
    const result = await client.query(`DELETE FROM gameinfo_russia_check_source_credentials WHERE source_id=$1`, [normalizedSourceId]);
    if (!result.rowCount) throw httpError("Source นี้ยังไม่มี session", 404);
    await client.query(`UPDATE gameinfo_russia_check_sources SET enabled=false,updated_at=NOW() WHERE id=$1 AND auth_required`, [normalizedSourceId]);
    await client.query("COMMIT");
    return { sourceId: normalizedSourceId, configured: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function getRussiaCheckSourceSession(sourceId) {
  const normalizedSourceId = optionalPositiveInt(sourceId, "Source ID");
  const pool = await getPool();
  const result = await pool.query(
    `SELECT session_enc,expires_at FROM gameinfo_russia_check_source_credentials WHERE source_id=$1`,
    [normalizedSourceId]
  );
  if (!result.rows[0]) return null;
  if (result.rows[0].expires_at && new Date(result.rows[0].expires_at) <= new Date()) return null;
  return { cookie: decryptRussiaCheckSession(result.rows[0].session_enc), expiresAt: result.rows[0].expires_at };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, { fetchImpl, retries, retryDelay }) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        const error = new Error(`Xsolla ตอบกลับ ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === retries - 1) break;
      await retryDelay(attempt);
    }
  }
  throw lastError || new Error("โหลด Xsolla ไม่สำเร็จ");
}

export async function fetchRussiaCheckCatalog(source, options = {}) {
  if (source.provider && source.provider !== "xsolla") {
    throw httpError("ยังไม่มีตัวดึงรายการแพ็กสำหรับ Source นี้ ไม่สามารถใช้ API ของ Xsolla แทนได้", 409);
  }
  const fetchImpl = options.fetchImpl || fetch;
  const retries = Math.max(1, Number(options.retries) || 3);
  const retryDelay = options.retryDelay || ((attempt) => wait([1000, 3000, 5000][attempt] || 5000));
  const collected = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`${String(source.sourceUrl || source.source_url).replace(/\/$/, "")}/project/${source.projectId || source.project_id}/items/virtual_items`);
    url.searchParams.set("limit", String(RUSSIA_CHECK_PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("locale", source.locale || "en");
    url.searchParams.set("country", source.country || "RU");
    const payload = await fetchJsonWithRetry(url, { fetchImpl, retries, retryDelay });
    if (!Array.isArray(payload?.items)) throw new Error("รูปแบบข้อมูล Xsolla ไม่ถูกต้อง");
    collected.push(...payload.items);
    if (!payload.has_more) return normalizeRussiaCheckCatalog(collected);
    if (!payload.items.length) throw new Error("Xsolla ระบุว่ามีหน้าถัดไปแต่ไม่ส่ง Pack");
    offset += payload.items.length;
  }
  throw new Error("Xsolla ส่งหน้ารายการมากเกินขีดจำกัด");
}

function mapRun(row, sources = []) {
  if (!row) return null;
  return {
    id: Number(row.id), targetGameId: row.target_game_id == null ? null : Number(row.target_game_id),
    triggerType: row.trigger_type, status: row.status, totalSources: Number(row.total_sources),
    completedSources: Number(row.completed_sources), failedSources: Number(row.failed_sources),
    addedCount: Number(row.added_count), pendingCount: Number(row.pending_count),
    removedCount: Number(row.removed_count), restoredCount: Number(row.restored_count),
    error: row.error, createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at,
    sources,
  };
}

async function updateRunSummary(pool, runId) {
  const totals = await pool.query(
    `SELECT COUNT(*)::int total,
            COUNT(*) FILTER (WHERE status='completed')::int completed,
            COUNT(*) FILTER (WHERE status='failed')::int failed,
            COALESCE(SUM(added_count),0)::int added,
            COALESCE(SUM(pending_count),0)::int pending,
            COALESCE(SUM(removed_count),0)::int removed,
            COALESCE(SUM(restored_count),0)::int restored,
            STRING_AGG(NULLIF(error,''), E'\n') FILTER (WHERE status='failed') errors
       FROM gameinfo_russia_check_run_sources WHERE run_id=$1`,
    [runId]
  );
  const value = totals.rows[0];
  const status = Number(value.failed) === Number(value.total) ? "failed" : Number(value.failed) > 0 ? "partial" : "completed";
  await pool.query(
    `UPDATE gameinfo_russia_check_runs SET status=$2, total_sources=$3, completed_sources=$4,
       failed_sources=$5, added_count=$6, pending_count=$7, removed_count=$8, restored_count=$9,
       error=COALESCE($10,''), finished_at=NOW() WHERE id=$1`,
    [runId, status, value.total, value.completed, value.failed, value.added, value.pending, value.removed, value.restored, value.errors]
  );
}

async function processSource(pool, runId, source) {
  await pool.query(
    `UPDATE gameinfo_russia_check_run_sources SET status='running', started_at=COALESCE(started_at,NOW()), error='' WHERE run_id=$1 AND source_id=$2`,
    [runId, source.id]
  );
  let credential;
  try {
    const game = await pool.query(`SELECT id, game FROM game_list WHERE id=$1`, [source.game_id]);
    const actualName = String(game.rows[0]?.game || "").trim().toUpperCase();
    if (!game.rows[0] || actualName !== String(source.expected_game_name).trim().toUpperCase()) {
      throw new Error(`Source ${source.source_key} ต้องผูกกับ Game ID ${source.game_id} ชื่อ ${source.expected_game_name}`);
    }
    let catalog;
    if (["infold", "gryphline"].includes(source.provider)) {
      credential = (await pool.query(`SELECT * FROM gameinfo_russia_check_source_credentials WHERE source_id=$1`, [source.id])).rows[0];
      if (!credential || credential.credential_kind !== source.provider || !credential.verified_at || credential.invalidated_at || (credential.expires_at && new Date(credential.expires_at) <= new Date())) {
        throw Object.assign(httpError("ต้องเชื่อมบัญชีและตรวจสอบ Login ใหม่", 409), { authInvalid: true });
      }
      let session;
      try { session = JSON.parse(decryptRussiaCheckSession(credential.session_enc)); }
      catch { throw Object.assign(httpError("อ่าน Session ไม่สำเร็จ กรุณาเชื่อมบัญชีใหม่", 409), { authInvalid: true }); }
      catalog = await (source.provider === "infold" ? fetchInfoldCatalog(session) : fetchGryphlineCatalog(session));
    } else if (source.provider === "midasbuy") catalog = await fetchMidasbuyCatalog(source);
    else catalog = await fetchRussiaCheckCatalog(source);
    const hash = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (["infold", "gryphline"].includes(source.provider)) {
        const currentSource = (await client.query(`SELECT enabled FROM gameinfo_russia_check_sources WHERE id=$1 FOR UPDATE`, [source.id])).rows[0];
        const currentCredential = (await client.query(`SELECT session_enc,invalidated_at FROM gameinfo_russia_check_source_credentials WHERE source_id=$1`, [source.id])).rows[0];
        if (!currentSource?.enabled || currentCredential?.session_enc !== credential.session_enc || currentCredential?.invalidated_at) throw httpError("Login เปลี่ยนระหว่างตรวจ กรุณารีใหม่", 409);
      }
      const [currentResult, previousRun] = await Promise.all([
        client.query(`SELECT * FROM gameinfo_russia_check_items WHERE source_id=$1 FOR UPDATE`, [source.id]),
        client.query(
          `SELECT EXISTS(SELECT 1 FROM gameinfo_russia_check_run_sources WHERE source_id=$1 AND run_id<>$2 AND status='completed') AS seen`,
          [source.id, runId]
        ),
      ]);
      const existing = currentResult.rows.map((row) => ({ ...row, missingRuns: Number(row.missing_runs) }));
      const baseline = !previousRun.rows[0]?.seen;
      const plan = reconcileRussiaCheckCatalog(existing, catalog, { baseline });
      const existingSkus = new Set(existing.map((item) => item.sku));
      const incomingSkus = new Set(catalog.map((item) => item.sku));
      for (const item of plan.items) {
        if (!existingSkus.has(item.sku)) {
          await client.query(
            `INSERT INTO gameinfo_russia_check_items
               (source_id,sku,name,status,missing_runs,is_baseline,first_seen_at,last_seen_at,activated_at,updated_at)
             VALUES ($1,$2,$3,'active',0,$4,NOW(),NOW(),NOW(),NOW())`,
            [source.id, item.sku, item.name, baseline]
          );
        } else if (incomingSkus.has(item.sku)) {
          await client.query(
            `UPDATE gameinfo_russia_check_items SET name=$3,status='active',missing_runs=0,last_seen_at=NOW(),
               activated_at=CASE WHEN status='removed' THEN NOW() ELSE activated_at END,
               removed_at=CASE WHEN status='removed' THEN NULL ELSE removed_at END,updated_at=NOW()
             WHERE source_id=$1 AND sku=$2`,
            [source.id, item.sku, item.name]
          );
        } else {
          await client.query(
            `UPDATE gameinfo_russia_check_items SET status=$3,missing_runs=$4,
               removed_at=CASE WHEN $3='removed' THEN COALESCE(removed_at,NOW()) ELSE removed_at END,updated_at=NOW()
             WHERE source_id=$1 AND sku=$2`,
            [source.id, item.sku, item.status, item.missingRuns]
          );
        }
      }
      for (const event of plan.events) {
        await client.query(
          `INSERT INTO gameinfo_russia_check_events (run_id,source_id,sku,pack_name,event_type) VALUES ($1,$2,$3,$4,$5)`,
          [runId, source.id, event.sku, event.name, event.kind]
        );
      }
      const counts = Object.fromEntries(["added", "removed", "restored"].map((kind) => [kind, plan.events.filter((event) => event.kind === kind).length]));
      const pending = plan.items.filter((item) => item.status === "pending_removal").length;
      await client.query(
        `UPDATE gameinfo_russia_check_run_sources SET status='completed',item_count=$3,added_count=$4,
           pending_count=$5,removed_count=$6,restored_count=$7,catalog_hash=$8,error='',finished_at=NOW()
         WHERE run_id=$1 AND source_id=$2`,
        [runId, source.id, catalog.length, counts.added, pending, counts.removed, counts.restored, hash]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.authInvalid && credential) {
      await pool.query(`UPDATE gameinfo_russia_check_source_credentials SET invalidated_at=NOW() WHERE source_id=$1 AND session_enc=$2`, [source.id, credential.session_enc]);
    }
    await pool.query(
      `UPDATE gameinfo_russia_check_run_sources SET status='failed',error=$3,finished_at=NOW() WHERE run_id=$1 AND source_id=$2`,
      [runId, source.id, String(error?.message || error).slice(0, 2000)]
    );
  }
}

async function executeRun(runId) {
  const pool = await getPool();
  await pool.query(`UPDATE gameinfo_russia_check_runs SET status='running',started_at=COALESCE(started_at,NOW()) WHERE id=$1`, [runId]);
  const sources = await pool.query(
    `SELECT s.* FROM gameinfo_russia_check_run_sources rs
       JOIN gameinfo_russia_check_sources s ON s.id=rs.source_id
      WHERE rs.run_id=$1 AND rs.status<>'completed' ORDER BY s.id`,
    [runId]
  );
  for (const source of sources.rows) await processSource(pool, runId, source);
  await updateRunSummary(pool, runId);
}

function launchRun(runId) {
  if (runners.has(runId)) return runners.get(runId);
  const promise = executeRun(runId)
    .catch((error) => console.error(`[gameinfo-russia-check] run ${runId} failed`, error))
    .finally(() => runners.delete(runId));
  runners.set(runId, promise);
  return promise;
}

export async function startRussiaCheck(actor, triggerType = "manual", gameId = null, retryRunId = null) {
  const pool = await getPool();
  const targetGameId = gameId == null || gameId === "" ? null : Number(gameId);
  if (targetGameId != null && (!Number.isInteger(targetGameId) || targetGameId <= 0)) throw httpError("Game ID ไม่ถูกต้อง", 400);
  const retryId = optionalPositiveInt(retryRunId, "Retry run ID");
  const retryClause = retryId == null ? "" : "AND EXISTS (SELECT 1 FROM gameinfo_russia_check_run_sources previous WHERE previous.source_id=s.id AND previous.run_id=$2 AND previous.status='failed')";
  const sources = await pool.query(
    `SELECT s.id FROM gameinfo_russia_check_sources s
     LEFT JOIN gameinfo_russia_check_source_credentials c ON c.source_id=s.id
     WHERE s.enabled AND ($1::int IS NULL OR s.game_id=$1) ${retryClause}
       AND ((s.provider IN ('xsolla','midasbuy') AND NOT s.auth_required) OR
         (s.provider='infold' AND c.credential_kind='infold' AND c.verified_at IS NOT NULL AND c.invalidated_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>NOW())) OR
         (s.provider='gryphline' AND c.credential_kind='gryphline' AND c.verified_at IS NOT NULL AND c.invalidated_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>NOW()))) ORDER BY s.id`,
    retryId == null ? [targetGameId] : [targetGameId, retryId]
  );
  if (!sources.rowCount) throw httpError("เกมนี้ยังไม่มี Source ที่พร้อมดึงข้อมูล การบันทึก session อย่างเดียวยังไม่เปิดใช้ API", 409);
  const active = await pool.query(`SELECT * FROM gameinfo_russia_check_runs WHERE status IN ('queued','running') ORDER BY id DESC LIMIT 1`);
  if (active.rows[0]) {
    launchRun(Number(active.rows[0].id));
    return { run: mapRun(active.rows[0]), existing: true };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO gameinfo_russia_check_runs (target_game_id,trigger_type,requested_by,total_sources)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [targetGameId, triggerType === "scheduled" ? "scheduled" : "manual", actorId(actor), sources.rowCount]
    );
    for (const source of sources.rows) {
      await client.query(`INSERT INTO gameinfo_russia_check_run_sources (run_id,source_id) VALUES ($1,$2)`, [result.rows[0].id, source.id]);
    }
    await client.query("COMMIT");
    launchRun(Number(result.rows[0].id));
    return { run: mapRun(result.rows[0]), existing: false };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      const concurrent = await pool.query(`SELECT * FROM gameinfo_russia_check_runs WHERE status IN ('queued','running') ORDER BY id DESC LIMIT 1`);
      if (concurrent.rows[0]) return { run: mapRun(concurrent.rows[0]), existing: true };
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getRussiaCheckRun(runId) {
  const normalizedRunId = optionalPositiveInt(runId, "Run ID");
  const pool = await getPool();
  const [run, sources] = await Promise.all([
    pool.query(`SELECT * FROM gameinfo_russia_check_runs WHERE id=$1`, [normalizedRunId]),
    pool.query(
      `SELECT rs.*,s.game_id,COALESCE(g.game,s.expected_game_name) AS game_name FROM gameinfo_russia_check_run_sources rs
       JOIN gameinfo_russia_check_sources s ON s.id=rs.source_id LEFT JOIN game_list g ON g.id=s.game_id
       WHERE rs.run_id=$1 ORDER BY s.game_id`,
      [normalizedRunId]
    ),
  ]);
  if (!run.rows[0]) throw httpError("ไม่พบ Russia Check run", 404);
  return mapRun(run.rows[0], sources.rows.map((row) => ({
    sourceId: Number(row.source_id), gameId: Number(row.game_id), gameName: row.game_name,
    status: row.status, itemCount: Number(row.item_count), error: row.error,
  })));
}

export async function getRussiaCheckGameLog() {
  return getRussiaCheckDailyLog(await getPool());
}

export async function getRussiaCheckDashboard({ gameId = null, status = "" } = {}) {
  const pool = await getPool();
  const normalizedGameId = optionalPositiveInt(gameId, "Game ID");
  if (status && !RUSSIA_CHECK_STATUSES.has(status)) throw httpError("สถานะ Pack ไม่ถูกต้อง", 400);
  const values = [normalizedGameId];
  const statusClause = status ? `AND i.status=$2` : "";
  if (status) values.push(status);
  const [gamesResult, itemsResult, summaryResult, runResult, dailyLog] = await Promise.all([
    pool.query(
      `SELECT DISTINCT s.id AS source_id,s.game_id,COALESCE(g.game,s.expected_game_name) AS game_name,s.expected_game_name,
              s.provider,s.store_url,s.enabled,s.auth_required,c.source_id IS NOT NULL AS auth_configured,c.expires_at AS auth_expires_at,
              c.credential_kind,c.verified_at,c.invalidated_at,
              CASE WHEN s.provider='demo' THEN false WHEN g.id IS NULL OR UPPER(TRIM(g.game))<>UPPER(TRIM(s.expected_game_name)) THEN true ELSE false END config_error
       FROM gameinfo_russia_check_sources s LEFT JOIN game_list g ON g.id=s.game_id
       LEFT JOIN gameinfo_russia_check_source_credentials c ON c.source_id=s.id
       WHERE s.enabled OR s.provider='demo' OR s.auth_required ORDER BY COALESCE(g.game,s.expected_game_name),s.game_id`
    ),
    pool.query(
      `SELECT i.name,i.status,i.is_baseline,i.first_seen_at,i.last_seen_at,i.activated_at,i.removed_at,
              i.missing_runs,s.game_id,COALESCE(g.game,s.expected_game_name) AS game_name
       FROM gameinfo_russia_check_items i JOIN gameinfo_russia_check_sources s ON s.id=i.source_id
       LEFT JOIN game_list g ON g.id=s.game_id
       WHERE ($1::int IS NULL OR s.game_id=$1) ${statusClause}
       ORDER BY g.game,i.name`,
      values
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE i.status='active')::int active,
              COUNT(*) FILTER (WHERE i.status='pending_removal')::int pending,
              COUNT(*) FILTER (WHERE i.status='removed')::int removed
       FROM gameinfo_russia_check_items i JOIN gameinfo_russia_check_sources s ON s.id=i.source_id
       WHERE ($1::int IS NULL OR s.game_id=$1)`,
      [normalizedGameId]
    ),
    pool.query(
      `SELECT r.*,
              CASE WHEN $1::int IS NULL THEN r.added_count ELSE x.added END AS added_count,
              CASE WHEN $1::int IS NULL THEN r.pending_count ELSE x.pending END AS pending_count,
              CASE WHEN $1::int IS NULL THEN r.removed_count ELSE x.removed END AS removed_count,
              CASE WHEN $1::int IS NULL THEN r.restored_count ELSE x.restored END AS restored_count
       FROM gameinfo_russia_check_runs r
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int source_count,COALESCE(SUM(rs.added_count),0)::int added,
                COALESCE(SUM(rs.pending_count),0)::int pending,COALESCE(SUM(rs.removed_count),0)::int removed,
                COALESCE(SUM(rs.restored_count),0)::int restored
         FROM gameinfo_russia_check_run_sources rs JOIN gameinfo_russia_check_sources s ON s.id=rs.source_id
         WHERE rs.run_id=r.id AND s.game_id=$1
       ) x ON true
      WHERE $1::int IS NULL OR x.source_count>0 ORDER BY r.id DESC LIMIT 1`,
      [normalizedGameId]
    ),
    // Daily game log is a global overview, independent of pack/game filters.
    getRussiaCheckDailyLog(pool),
  ]);
  const summary = summaryResult.rows[0] || {};
  return {
    games: gamesResult.rows.map((row) => {
      const source = {
        sourceId: Number(row.source_id), gameId: Number(row.game_id), gameName: row.game_name || row.expected_game_name,
        provider: row.provider,
        expectedGameName: row.expected_game_name, configError: row.config_error, isDemo: row.provider === "demo",
        storeUrl: row.store_url || null, sourceEnabled: row.enabled, authRequired: row.auth_required,
        authConfigured: row.auth_configured, authExpiresAt: row.auth_expires_at,
        credentialKind: row.credential_kind, authVerifiedAt: row.verified_at, authInvalidated: Boolean(row.invalidated_at),
      };
      return { ...source, ...getRussiaCheckSourceAvailability(source) };
    }),
    items: itemsResult.rows.map((row) => ({
      gameId: Number(row.game_id), gameName: row.game_name, name: row.name, status: row.status,
      isBaseline: row.is_baseline, missingRuns: Number(row.missing_runs), firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at, activatedAt: row.activated_at, removedAt: row.removed_at,
    })),
    summary: { active: Number(summary.active) || 0, pending: Number(summary.pending) || 0, removed: Number(summary.removed) || 0 },
    latestRun: mapRun(runResult.rows[0]),
    dailyLog,
    nextRunAt: nextRussiaCheckRunAt().toISOString(),
  };
}

export async function listRussiaCheckLogs({ gameId = null, eventType = "", cursor = null, limit = 50 } = {}) {
  const pool = await getPool();
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const normalizedGameId = optionalPositiveInt(gameId, "Game ID");
  const normalizedCursor = optionalPositiveInt(cursor, "Cursor");
  if (eventType && !RUSSIA_CHECK_EVENT_TYPES.has(eventType)) throw httpError("สถานะ Log ไม่ถูกต้อง", 400);
  const result = await pool.query(
    `SELECT e.id,e.pack_name,e.event_type,e.created_at,s.game_id,COALESCE(g.game,s.expected_game_name) AS game_name
       FROM gameinfo_russia_check_events e JOIN gameinfo_russia_check_sources s ON s.id=e.source_id
       LEFT JOIN game_list g ON g.id=s.game_id
      WHERE ($1::int IS NULL OR s.game_id=$1) AND ($2::bigint IS NULL OR e.id<$2)
        AND ($3::varchar IS NULL OR e.event_type=$3)
      ORDER BY e.id DESC LIMIT $4`,
    [normalizedGameId, normalizedCursor, eventType || null, normalizedLimit + 1]
  );
  const hasMore = result.rows.length > normalizedLimit;
  const rows = result.rows.slice(0, normalizedLimit);
  return {
    events: rows.map((row) => ({ id: Number(row.id), gameId: Number(row.game_id), gameName: row.game_name, packName: row.pack_name, eventType: row.event_type, createdAt: row.created_at })),
    nextCursor: hasMore ? String(rows.at(-1).id) : null,
  };
}

export async function recoverRussiaChecks() {
  const pool = await getPool();
  await pool.query(`UPDATE gameinfo_russia_check_runs SET status='queued',error=CONCAT(error,CASE WHEN error='' THEN '' ELSE E'\n' END,'recovered after restart') WHERE status='running'`);
  await pool.query(`UPDATE gameinfo_russia_check_run_sources SET status='queued' WHERE status='running'`);
  const queued = await pool.query(`SELECT id FROM gameinfo_russia_check_runs WHERE status='queued' ORDER BY id`);
  for (const row of queued.rows) launchRun(Number(row.id));
  return queued.rowCount;
}
