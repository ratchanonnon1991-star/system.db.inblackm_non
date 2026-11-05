// Read-only lookup of order numbers typed on the debit page, across every table an
// order can live in: telegram_orders_dev (all channels), codashop_orders (bot queue),
// kaleoz_orders / itemku_orders / g2g_orders (marketplace intake that may never reach
// Telegram). Explicit, non-personal projections only: no login, password, uid or buyer.
import { selectQuery } from "@/lib/profit-remote-db";

export const LOOKUP_MAX_REFS = 500;
const clean = value => String(value ?? "").trim().slice(0, 120);
// "#307174" is how sheets and the Donshop page name a queue row.
const queueId = ref => (/^#\d{1,10}$/.test(ref) ? ref.slice(1) : null);

export function createOrderLookup({ select = selectQuery } = {}) {
  return {
    /** @returns {Promise<Record<string, object>>} one entry per distinct ref */
    async lookup(refs) {
      const list = [...new Set((refs ?? []).map(clean).filter(Boolean))].slice(0, LOOKUP_MAX_REFS);
      const out = Object.fromEntries(list.map(ref => [ref, { ref, found: false, where: [], game: null, pack: null,
        telegramStatus: null, queue: [], botCompleted: false, marketplaceStatus: null }]));
      if (!list.length) return out;
      const plain = list.filter(r => !queueId(r)), ids = list.map(queueId).filter(Boolean);

      const telegram = plain.length ? [
        ...await select(`SELECT order_id, task_request_id, status, source, game_name, pack_name, price::text AS price
          FROM telegram_orders_dev WHERE order_id = ANY($1::text[])`, [plain]),
        ...await select(`SELECT order_id, task_request_id, status, source, game_name, pack_name, price::text AS price
          FROM telegram_orders_dev WHERE task_request_id = ANY($1::text[])`, [plain]),
      ] : [];
      const taskToRef = new Map();
      for (const t of telegram) {
        const ref = out[t.order_id] ? t.order_id : t.task_request_id;
        const e = out[ref];
        if (!e) continue;
        Object.assign(e, { found: true, game: e.game ?? t.game_name, pack: e.pack ?? t.pack_name, telegramStatus: t.status, source: t.source });
        if (!e.where.includes("telegram")) e.where.push("telegram");
        if (t.task_request_id) taskToRef.set(t.task_request_id, ref);
      }

      const tasks = [...taskToRef.keys()];
      const queueRows = [
        ...(tasks.length ? await select(`SELECT c.id, c.telegram_task_request_id AS task, c.status, c.payment_method, c.game_name, c.pack_name,
            c.pack_price, jsonb_typeof(c.provider_response->'manual_fulfillment') = 'object' AS manual_button,
            CASE WHEN jsonb_typeof(c.provider_response) = 'object' THEN c.provider_response->>'status' END AS bot_status
          FROM codashop_orders c WHERE c.telegram_task_request_id = ANY($1::text[])`, [tasks]) : []),
        ...(ids.length ? await select(`SELECT c.id, c.telegram_task_request_id AS task, c.status, c.payment_method, c.game_name, c.pack_name,
            c.pack_price, jsonb_typeof(c.provider_response->'manual_fulfillment') = 'object' AS manual_button,
            CASE WHEN jsonb_typeof(c.provider_response) = 'object' THEN c.provider_response->>'status' END AS bot_status
          FROM codashop_orders c WHERE c.id = ANY($1::int[])`, [ids.map(Number)]) : []),
      ];
      for (const q of queueRows) {
        const ref = out[`#${q.id}`] ? `#${q.id}` : taskToRef.get(q.task);
        const e = out[ref];
        if (!e || e.queue.some(x => x.id === String(q.id))) continue;
        e.found = true;
        if (!e.where.includes("queue")) e.where.push("queue");
        e.game ??= q.game_name; e.pack ??= q.pack_name;
        e.queue.push({ id: String(q.id), status: q.status, paymentMethod: q.payment_method, packPrice: q.pack_price, manualButton: q.manual_button === true, botStatus: q.bot_status ?? null });
        // The bot finished it itself: a hand debit for it is probably counted twice. A queue row a
        // person closed after the bot reported failure (e.g. WavePay short balance) does not count.
        if (q.status === "completed" && q.bot_status !== "failed" && !q.manual_button) e.botCompleted = true;
      }

      if (plain.length) {
        const marketplaces = [
          ["kaleoz", `SELECT order_id, game_name, product_name AS pack, total_amount::text AS amount, currency, status FROM kaleoz_orders WHERE order_id = ANY($1::text[])`],
          ["itemku", `SELECT order_id, game_name, product_name AS pack, total_price::text AS amount, 'IDR' AS currency, status FROM itemku_orders WHERE order_id = ANY($1::text[])`],
          ["g2g", `SELECT order_id, game_name, pack_name AS pack, price_after::text AS amount, NULL AS currency, order_status AS status FROM g2g_orders WHERE order_id = ANY($1::text[])`],
        ];
        for (const [name, sql] of marketplaces) {
          for (const m of await select(sql, [plain])) {
            const e = out[m.order_id];
            if (!e) continue;
            e.found = true;
            if (!e.where.includes(name)) e.where.push(name);
            e.game ??= m.game_name; e.pack ??= m.pack;
            e.marketplaceStatus ??= m.status == null ? null : String(m.status);
          }
        }
      }
      return out;
    },
  };
}

let repo;
export const orderLookup = () => repo ||= createOrderLookup();
