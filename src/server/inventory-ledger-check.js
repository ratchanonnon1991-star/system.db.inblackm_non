// Read-only chain check for every provider whose bot records wallet balances.
// Reads the bot database (and, only with withLedger, the inventory ledger).
// Never writes. Not wired to a route yet.
import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { codaDateBounds } from "@/lib/usdcodashop-report";
import { reconcile, toUnits } from "@/lib/inventory-ledger";
import { receiptEvidence, botEffects, summarizeWallet } from "@/lib/inventory-ledger-receipts";
import {
  LEDGER_CHECK_PROVIDERS, groupWallets, receiptRef,
  razerWallet, razerReceipt, neteaseWallet, neteaseReceipt, waveWallet, waveReceipt, waveQuote, WAVE_CHECK_START,
  shellWallet, shellReceipt, GAMEPOINT_WALLET, gamepointReceipts, PLSBUY_WALLET, plsbuyReceipts,
  DONSHOP_WALLET, donshopReceipt, donshopQuote,
} from "@/lib/inventory-ledger-sources";
import { WAVEPAY_METHOD, WAVE_PHONE_SQL } from "@/lib/wavepay-inventory";
import { SHELL_METHOD } from "@/lib/garena-shell-inventory";
import { GAMEPOINT_METHOD } from "@/lib/gamepoint-inventory";
import { PLSBUY_METHOD } from "@/lib/plsbuy-inventory";
import { DONSHOP_METHOD } from "@/lib/donshop-inventory";
import { createGamepointInventory } from "@/server/gamepoint-inventory";
import { createPlsbuyInventory } from "@/server/plsbuy-inventory";

const BATCH = 1000;
const MAX_ROWS = 20000;
const MAX_DAYS = 93;
const DAY_MS = 86400000;
const sourceBase = "split_part(c.source_order_id::text, ':', 1) AS source_base";
// Zone-less timestamps hold the DB's local time (TimeZone = Asia/Bangkok). Turn them into exact
// instants in SQL so nothing depends on the Node process time zone; a timestamptz passes through
// unchanged (::timestamp renders it in that same zone first).
export const at = column => `(${column}::timestamp AT TIME ZONE current_setting('TimeZone'))`;
// When the bot took the queue (for Donshop: when balance_before was read).
const started = `COALESCE(c.fill_started_at, ${at("c.created_at")})`;
const iso = value => new Date(value).toISOString();

/** Page through `sql` (which must filter `<cursor> > $1` and end with ORDER BY <cursor>). */
async function paged(select, sql, params, cursorField) {
  const rows = [];
  let cursor = "0";
  for (;;) {
    const batch = await select(`${sql} LIMIT ${BATCH}`, [cursor, ...params]);
    rows.push(...batch);
    if (rows.length > MAX_ROWS) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
    if (batch.length < BATCH) break;
    cursor = String(batch.at(-1)[cursorField]);
  }
  if (new Set(rows.map(r => String(r[cursorField]))).size !== rows.length) throw inventoryError("พบรายการซ้ำ ต้องตรวจสอบก่อนรวมยอด", 409);
  return rows;
}

/**
 * codashop_orders rows for one payment method, chained in the order the bot took them.
 * A queue can be taken hours after it was created, so one earlier day is read as context,
 * plus each wallet's last completed queue before that as the anchor (looked back 31 days).
 * Gaps and totals before the range are hidden again by `since`.
 */
async function codashopChain(select, bounds, { method, columns, wallet, where = "TRUE", anchorWhere = "TRUE" }) {
  const contextStart = new Date(Date.parse(bounds.start) - DAY_MS).toISOString();
  const lookback = new Date(Date.parse(bounds.start) - 31 * DAY_MS).toISOString();
  const fields = `c.id, c.status, c.source_order_id, ${sourceBase}, ${at("c.created_at")} AS occurred_at, ${started} AS started_at, ${columns}`;
  const rows = await paged(select, `SELECT ${fields} FROM codashop_orders c
    WHERE c.id > $1::bigint AND c.payment_method = $4 AND ${where}
      AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz ORDER BY c.id`, [contextStart, bounds.end, method], "id");
  const anchors = await select(`SELECT DISTINCT ON (${wallet}) ${fields} FROM codashop_orders c
    WHERE c.payment_method = $1 AND ${where} AND c.status = 'completed' AND ${anchorWhere}
      AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz
    ORDER BY ${wallet}, ${started} DESC, c.id DESC`, [method, lookback, contextStart]);
  const ids = new Set(rows.map(r => String(r.id)));
  return {
    all: [...anchors.filter(a => !ids.has(String(a.id))), ...rows],
    inRange: rows.filter(r => Date.parse(iso(r.occurred_at)) >= Date.parse(bounds.start)).length,
  };
}

// Explicit projections only: no credentials, sessions, receipt URLs or raw payloads.
async function unfinished(select, method, bounds) {
  return select(`SELECT c.id, c.status, c.source_order_id, ${sourceBase}, ${started} AS started_at
    FROM codashop_orders c WHERE c.payment_method=$1 AND c.status <> 'completed'
      AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz ORDER BY c.id LIMIT 2000`, [method, bounds.start, bounds.end]);
}
const hintsOf = rows => rows.map(r => ({ at: r.started_at, status: String(r.status), ref: receiptRef(r, r.id) }));

/** Exact start instants for fills an inventory page returned (its own times may be zone-shifted). */
async function startTimes(select, ids) {
  const times = new Map();
  const list = [...new Set(ids.filter(id => /^\d+$/.test(id)))];
  for (let i = 0; i < list.length; i += BATCH) {
    const rows = await select(`SELECT c.id, ${started} AS started_at FROM codashop_orders c WHERE c.id = ANY($1::bigint[])`, [list.slice(i, i + BATCH)]);
    for (const r of rows) times.set(String(r.id), iso(r.started_at));
  }
  return times;
}
const withStarts = (entries, times) => entries.map(e => ({ ...e,
  fills: (e.fills ?? [e]).map(f => ({ ...f, startedAt: times.get(String(f.id)) ?? null })) }));

// Sales enrichment is not needed to check balances; skip it (and its rate lookups).
const noSales = { enrich: async (_select, rows) => rows.map(r => ({ ...r, sheet_fields: {} })), prepareSales: async items => items };

async function pageReceipts(select, report, toReceipts) {
  const fills = report.entries.flatMap(e => e.fills ?? [e]);
  return toReceipts(withStarts(report.entries, await startTimes(select, fills.map(f => String(f.id)))));
}

export const LEDGER_CHECK_LOADERS = {
  razer: {
    label: "Razer Gold",
    async load({ select, bounds }) {
      const rows = await paged(select, `SELECT n.id AS history_id, n.status, n.purchase_email, n.currency_code,
          n.old_balance_gold::text AS old_balance_gold, n.deducted::text AS deducted, n.new_balance_gold::text AS new_balance_gold,
          ${at("n.created_at")} AS occurred_at, ${at("n.balance_received_at")} AS balance_received_at, ${at("n.completed_at")} AS completed_at,
          c.source_order_id, ${sourceBase}
        FROM razer_purchase_history n LEFT JOIN codashop_orders c ON c.id = n.order_id
        WHERE n.id > $1::bigint AND n.created_at >= $2::timestamptz AND n.created_at < $3::timestamptz ORDER BY n.id`,
      [bounds.start, bounds.end], "history_id");
      return { rows: rows.length, ...groupWallets(rows, { wallet: razerWallet, receipt: razerReceipt, quote: r => r.deducted }) };
    },
  },
  netease: {
    label: "Netease",
    async load({ select, bounds }) {
      const rows = await paged(select, `SELECT n.id AS history_id, n.purchase_email, n.currency,
          n.old_balance::text AS old_balance, n.deducted::text AS deducted, n.new_balance::text AS new_balance,
          ${at("n.created_at")} AS occurred_at, ${at("n.balance_received_at")} AS balance_received_at, c.source_order_id, ${sourceBase}
        FROM netease_purchase_history n LEFT JOIN codashop_orders c ON c.id = n.order_id
        WHERE n.id > $1::bigint AND n.created_at >= $2::timestamptz AND n.created_at < $3::timestamptz ORDER BY n.id`,
      [bounds.start, bounds.end], "history_id");
      return { rows: rows.length, ...groupWallets(rows, { wallet: neteaseWallet, receipt: neteaseReceipt }) };
    },
  },
  wavepay: {
    label: "WavePay",
    note: `นับตั้งแต่ ${WAVE_CHECK_START.slice(0, 10)} ตามหน้า WavePay`,
    async load({ select, bounds }) {
      const waveStart = iso(WAVE_CHECK_START);
      const clipped = { ...bounds, start: Date.parse(bounds.start) > Date.parse(waveStart) ? bounds.start : waveStart };
      const balances = "CASE WHEN jsonb_typeof(c.provider_response)='object' THEN c.provider_response->'balances' END";
      const chain = await codashopChain(select, clipped, {
        method: WAVEPAY_METHOD, wallet: WAVE_PHONE_SQL,
        columns: `c.pack_price, ${WAVE_PHONE_SQL} AS phone_key, ${balances}->>'oldBalance' AS old_balance, ${balances}->>'newBalance' AS new_balance,
          CASE WHEN jsonb_typeof(c.provider_response)='object' THEN c.provider_response->>'status' END AS bot_status,
          CASE WHEN jsonb_typeof(c.provider_response->'error')='object' THEN c.provider_response->'error'->>'code' END AS bot_error_code,
          CASE WHEN jsonb_typeof(c.provider_response->'error')='object' THEN left(c.provider_response->'error'->>'message', 300) END AS bot_error_message`,
        anchorWhere: `${balances}->>'newBalance' IS NOT NULL`,
      });
      return { rows: chain.inRange, since: clipped.start, ...groupWallets(chain.all, { wallet: waveWallet, receipt: waveReceipt, quote: waveQuote }) };
    },
  },
  "garena-shell": {
    label: "Garena Shell",
    async load({ select, bounds }) {
      const user = "lower(btrim(c.provider_response->>'garena_username'))";
      const chain = await codashopChain(select, bounds, {
        method: SHELL_METHOD, wallet: user,
        columns: `c.provider_response->>'garena_username' AS garena_username, c.provider_response->>'shell_used' AS shell_used,
          c.provider_response->>'shell_balance_before' AS shell_before, c.provider_response->>'shell_balance_after' AS shell_after,
          c.provider_response->>'shell_balance' AS shell_balance`,
        anchorWhere: "c.provider_response->>'shell_balance_before' IS NOT NULL",
      });
      return { rows: chain.inRange, since: bounds.start, ...groupWallets(chain.all, { wallet: shellWallet, receipt: shellReceipt, quote: r => r.shell_used }) };
    },
  },
  gamepoint: {
    label: "Gamepoint",
    note: "มีแค่ยอดก่อนส่งคำสั่ง ถ้ามีออเดอร์ทำพร้อมกันอาจเห็นส่วนต่างที่ไม่จริง",
    async load({ select, actor, dateFrom, dateTo, bounds }) {
      const report = await createGamepointInventory({ select, ...noSales }).list(actor, { dateFrom, dateTo }, { exportAll: true });
      const receipts = await pageReceipts(select, report, gamepointReceipts);
      return { rows: receipts.length, unplaced: 0,
        wallets: [{ ...GAMEPOINT_WALLET, receipts, hints: hintsOf(await unfinished(select, GAMEPOINT_METHOD, bounds)) }] };
    },
  },
  plsbuy: {
    label: "Plsbuy",
    note: "ตรวจได้เฉพาะออเดอร์ที่บอทเก็บยอด API ไว้ (หลังอัปเดตบอท)",
    async load({ select, actor, dateFrom, dateTo, bounds }) {
      const report = await createPlsbuyInventory({ select, ...noSales }).list(actor, { dateFrom, dateTo }, { exportAll: true });
      const receipts = await pageReceipts(select, report, plsbuyReceipts);
      return { rows: receipts.length, unplaced: 0,
        wallets: [{ ...PLSBUY_WALLET, receipts, hints: hintsOf(await unfinished(select, PLSBUY_METHOD, bounds)) }] };
    },
  },
  donshop: {
    label: "Donshop",
    note: "เฉพาะคิวที่บอททำ เรียงตามเวลาที่บอทเริ่มทำ แบบเดียวกับหน้า Donshop",
    async load({ select, bounds }) {
      const meta = "c.provider_response->'_worker_meta'";
      const chain = await codashopChain(select, bounds, {
        method: DONSHOP_METHOD, wallet: "c.payment_method", where: `jsonb_typeof(${meta})='object'`,
        columns: `${meta}->>'balance_before' AS balance_before, ${meta}->>'live_cost_total' AS live_cost_total,
          ${meta}->>'live_cost' AS live_cost, ${meta}->>'quantity' AS quantity`,
        anchorWhere: `(${meta}->>'balance_before') ~ '^[0-9]{1,12}(\\.[0-9]{1,20})?$'`,
      });
      return { rows: chain.inRange, since: bounds.start,
        ...groupWallets(chain.all, { wallet: () => DONSHOP_WALLET, receipt: donshopReceipt, quote: donshopQuote }) };
    },
  },
};

/**
 * @param {{ select?: Function, ledger?: () => object, loaders?: object }} deps
 *   `ledger` is only called with `withLedger`, so a bot-only check never
 *   touches the tools database (not even to create the ledger tables).
 */
export function createInventoryCheck({ select = selectQuery, ledger = null, loaders = LEDGER_CHECK_LOADERS } = {}) {
  return {
    providers: LEDGER_CHECK_PROVIDERS.map(id => ({ id, label: loaders[id]?.label ?? id, note: loaders[id]?.note ?? null })),
    async check(actor, { provider, dateFrom, dateTo, account = "", tolerance = "0", withLedger = false } = {}) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดูบัญชีคลัง", 403);
      if (!LEDGER_CHECK_PROVIDERS.includes(provider) || !loaders[provider]) throw inventoryError(`ผู้ให้บริการต้องเป็น ${LEDGER_CHECK_PROVIDERS.join(", ")}`);
      if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
      const bounds = codaDateBounds({ dateFrom, dateTo });
      if (Date.parse(bounds.end) - Date.parse(bounds.start) > MAX_DAYS * 86400000) throw inventoryError(`เลือกช่วงวันที่ได้ไม่เกิน ${MAX_DAYS} วัน`);
      toUnits(tolerance, { allowZero: true, field: "ค่าคลาดเคลื่อน" });
      if (withLedger && typeof ledger !== "function") throw inventoryError("ไม่ได้ตั้งค่าฐานข้อมูลบัญชีคลัง", 500);
      const wanted = String(account || "").trim().toLowerCase().slice(0, 200);

      const loaded = await loaders[provider].load({ select, actor, dateFrom, dateTo, bounds });
      const results = [];
      for (const wallet of loaded.wallets) {
        if (wanted && !wallet.key.toLowerCase().includes(wanted) && !String(wallet.label).toLowerCase().includes(wanted)) continue;
        const evidence = receiptEvidence(wallet.receipts, wallet.hints);
        const since = { since: loaded.since ?? null };
        if (wallet.uncheckable) { results.push(summarizeWallet(wallet, evidence, null, since)); continue; }
        const result = withLedger
          ? await ledger().reconcileAccount(actor, { key: wallet.key }, {
            from: bounds.start, to: bounds.end, tolerance,
            botMovements: evidence.botMovements, externalSnapshots: evidence.snapshots,
          })
          : { registered: false, ...reconcile({ snapshots: evidence.snapshots, movements: botEffects(evidence.botMovements), tolerance }) };
        results.push(summarizeWallet(wallet, evidence, result, since));
      }
      return {
        provider, providerLabel: loaders[provider].label ?? provider, note: loaders[provider].note ?? null,
        dateFrom, dateTo, withLedger, receipts: loaded.rows, unplacedReceipts: loaded.unplaced ?? 0,
        walletsWithGaps: results.filter(w => w.gaps.length).length,
        wallets: results.sort((a, b) => b.gaps.length - a.gaps.length || a.key.localeCompare(b.key)),
      };
    },
  };
}
