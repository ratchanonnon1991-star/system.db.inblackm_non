// Read-only: hand-filled orders across every channel, paired with the wallet drop
// each probably came from. Never writes. Not wired to a route yet.
import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { codaDateBounds } from "@/lib/usdcodashop-report";
import { LEDGER_CHECK_PROVIDERS } from "@/lib/inventory-ledger-sources";
import { MANUAL_METHOD_PROVIDER, manualCandidate, matchManualFills } from "@/lib/inventory-ledger-manual";
import { WAVE_NOT_CHARGED_CODE } from "@/lib/wavepay-inventory";
import { at, createInventoryCheck } from "@/server/inventory-ledger-check";

const BATCH = 1000;
const MAX_ROWS = 20000;
const MAX_DAYS = 92; // the wallet check also reads the day after, and allows 93
const DAY_MS = 86400000;
// Channels whose bot writes _worker_meta when it takes a queue: without it, a person did it.
const META_METHODS = ["GamePointClub", "PlsbuyMYR", "DonShopIDR"];
const nextDay = day => new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** payment_method values seen on real Razer / Netease receipts around the range. */
async function learnedMethods(select, bounds) {
  const since = new Date(Date.parse(bounds.start) - 31 * DAY_MS).toISOString();
  const rows = await select(`SELECT 'razer' AS provider, c.payment_method, COUNT(*)::int AS receipts
      FROM razer_purchase_history n JOIN codashop_orders c ON c.id = n.order_id
      WHERE n.created_at >= $1::timestamptz AND n.created_at < $2::timestamptz AND c.payment_method IS NOT NULL GROUP BY 2
    UNION ALL
    SELECT 'netease', c.payment_method, COUNT(*)::int
      FROM netease_purchase_history n JOIN codashop_orders c ON c.id = n.order_id
      WHERE n.created_at >= $1::timestamptz AND n.created_at < $2::timestamptz AND c.payment_method IS NOT NULL GROUP BY 2`, [since, bounds.end]);
  const best = new Map();
  for (const r of rows) {
    if (MANUAL_METHOD_PROVIDER[r.payment_method]) continue;
    const seen = best.get(r.payment_method);
    if (!seen || r.receipts > seen.receipts) best.set(r.payment_method, r);
  }
  return Object.fromEntries([...best].map(([method, r]) => [method, r.provider]));
}

async function candidateRows(select, bounds, learned) {
  const pr = "c.provider_response";
  const razer = Object.keys(learned).filter(m => learned[m] === "razer");
  const netease = Object.keys(learned).filter(m => learned[m] === "netease");
  const rows = [];
  let cursor = "0";
  for (;;) {
    // Explicit projections only: no credentials, sessions, receipt URLs or raw payloads.
    const batch = await select(`SELECT c.id, c.payment_method, c.status, c.source_order_id, split_part(c.source_order_id::text, ':', 1) AS source_base,
        c.pack_price, c.game_name, c.pack_name, ${at("c.created_at")} AS created_at, ${at("c.updated_at")} AS updated_at,
        ${pr}->'_worker_meta'->>'live_cost_total' AS live_cost_total, ${pr}->'_worker_meta'->>'live_cost' AS live_cost,
        ${pr}->'_worker_meta'->>'quantity' AS quantity,
        COALESCE(c.raw_data::text LIKE '%"stale_closed"%', FALSE) AS quarantined,
        CASE WHEN c.status = 'manual' THEN 'manual'
          WHEN c.payment_method = 'WavePay' AND jsonb_typeof(${pr}) IS DISTINCT FROM 'object' THEN 'no-bot'
          WHEN c.payment_method = 'WavePay' AND ${pr}->'error'->>'code' = $7 THEN 'not-charged'
          WHEN c.payment_method = 'WavePay' THEN 'bot-failed'
          WHEN c.payment_method = 'GarenaShells' OR c.payment_method = ANY($5::text[]) THEN 'no-bot'
          ELSE 'no-receipt' END AS reason
      FROM codashop_orders c
      WHERE c.id > $1::bigint AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz
        AND (c.status = 'manual' OR (c.status = 'completed' AND (
          (c.payment_method = 'WavePay' AND NULLIF(${pr}->'balances'->>'oldBalance', '') IS NULL
            AND NULLIF(${pr}->'balances'->>'newBalance', '') IS NULL
            AND (jsonb_typeof(${pr}) IS DISTINCT FROM 'object' OR ${pr}->>'status' = 'failed'))
          OR (c.payment_method = 'GarenaShells' AND COALESCE(${pr}->>'shell_balance_before', ${pr}->>'shell_balance_after',
            ${pr}->>'shell_used', ${pr}->>'shell_balance') IS NULL)
          OR (c.payment_method = ANY($5::text[]) AND jsonb_typeof(${pr}->'_worker_meta') IS DISTINCT FROM 'object')
          OR (c.payment_method = ANY($4::text[]) AND NOT EXISTS (SELECT 1 FROM razer_purchase_history n WHERE n.order_id = c.id AND n.status = 'completed'))
          OR (c.payment_method = ANY($6::text[]) AND NOT EXISTS (SELECT 1 FROM netease_purchase_history n WHERE n.order_id = c.id)))))
      ORDER BY c.id LIMIT ${BATCH}`, [cursor, bounds.start, bounds.end, razer, META_METHODS, netease, WAVE_NOT_CHARGED_CODE]);
    rows.push(...batch);
    if (rows.length > MAX_ROWS) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
    if (batch.length < BATCH) break;
    cursor = String(batch.at(-1).id);
  }
  return rows;
}

/**
 * @param {{ select?: Function, ledger?: () => object, check?: object }} deps
 *   `ledger` is only called with `withLedger` (to mark orders already recorded).
 */
export function createManualFillCheck({ select = selectQuery, ledger = null, check = null } = {}) {
  const checker = check ?? createInventoryCheck({ select, ledger });
  return {
    async list(actor, { dateFrom, dateTo, channel = "", withLedger = false } = {}) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดูบัญชีคลัง", 403);
      if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
      const bounds = codaDateBounds({ dateFrom, dateTo });
      if (Date.parse(bounds.end) - Date.parse(bounds.start) > MAX_DAYS * DAY_MS) throw inventoryError(`เลือกช่วงวันที่ได้ไม่เกิน ${MAX_DAYS} วัน`);
      if (withLedger && typeof ledger !== "function") throw inventoryError("ไม่ได้ตั้งค่าฐานข้อมูลบัญชีคลัง", 500);
      const wanted = String(channel || "").trim().toLowerCase();

      const learned = await learnedMethods(select, bounds);
      const methods = { ...MANUAL_METHOD_PROVIDER, ...learned };
      const candidates = (await candidateRows(select, bounds, learned)).map(r => manualCandidate(r, methods)).filter(Boolean)
        .filter(c => !wanted || c.provider === wanted || c.method.toLowerCase() === wanted);

      // A hand fill shows up at the wallet's next bot reading, which can be the next day.
      const reports = {}, unavailable = new Set(), errors = {};
      for (const provider of LEDGER_CHECK_PROVIDERS.filter(p => candidates.some(c => c.provider === p))) {
        try {
          reports[provider] = await checker.check(actor, { provider, dateFrom, dateTo: nextDay(dateTo), withLedger });
        } catch (error) {
          unavailable.add(provider); errors[provider] = error.message;
        }
      }
      const recorded = withLedger ? await ledger().recordedOrderRefs(actor, candidates.map(c => c.ref)) : new Set();
      const result = matchManualFills(candidates, reports, recorded, unavailable);
      // Drops found only in the extra day belong to the next range.
      const orphanGaps = result.orphanGaps.filter(g => Date.parse(g.from) < Date.parse(bounds.end));
      const byMethod = {};
      for (const c of result.candidates) {
        const m = byMethod[c.method] ??= { method: c.method, provider: c.provider, total: 0, matched: 0, unmatched: 0 };
        m.total++; if (c.verdict === "matched") m.matched++; if (c.verdict === "unmatched" || c.verdict === "ambiguous") m.unmatched++;
      }
      return {
        dateFrom, dateTo, withLedger, learnedMethods: learned, checkErrors: errors,
        candidates: result.candidates, summary: { ...result.summary, orphanGaps: orphanGaps.length }, orphanGaps,
        byMethod: Object.values(byMethod).sort((a, b) => b.total - a.total),
      };
    },
  };
}
