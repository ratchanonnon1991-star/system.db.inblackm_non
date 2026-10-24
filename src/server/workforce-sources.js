// Only allowlisted tables/columns may become SQL identifiers. Never accept SQL,
// table names or connection strings from the dashboard request.
export const BOT_SOURCES = [
  { table: "kaleoz_orders", channel: "kaleoz", key: "order_id", time: ["paid_time", "created_at"], priority: 0 },
  { table: "itemku_orders", channel: "itemku", key: "order_id", time: ["paid_at", "created_at"], priority: 0 },
  { table: "g2g_orders", channel: "g2g", key: "order_id", time: ["created_at"], priority: 0 },
  { table: "playerok_orders", channel: "playerok", key: "order_id", time: ["paid_at", "created_at"], priority: 0 },
  { table: "playerok_orders_topupman", channel: "playerok", key: "order_id", time: ["paid_at", "created_at"], priority: 1 },
  { table: "order_russia_new", channel: "russia", key: "order_id", unit: "task_id", time: ["task_created_at", "created_at"], priority: 0 },
  { table: "order_russia", channel: "russia", key: "order_id", unit: "task_id", time: ["task_created_at", "created_at"], priority: 1 },
  { table: "order_inblackm", channel: "inblackm_reseller", key: "order_id", unit: "task_id", time: ["task_created_at", "created_at"], priority: 0 },
  { table: "telegram_orders_dev", kind: "telegram", key: "order_id", unit: "task_request_id", time: ["created_at"], priority: 10 },
  { table: "codashop_orders", kind: "codashop", key: "id", time: ["created_at"], priority: 20 },
];
export const WEB_SOURCE = { table: "queue_bot_orders", channel: "web", key: "order_id", unit: "id", time: ["created_at"], priority: 0 };
const quote = value => `"${value.replaceAll('"', '""')}"`;
const columnText = (map, alias, key) => map.has(key) ? `NULLIF(TRIM(${alias}.${quote(key)}::text),'')` : "NULL::text";

function inferredChannel(text, linkedText) {
  const hints = `lower(concat_ws(' ',${text("source")},${text("source_group")},${text("telegram_task_request_id")},${text("task_request_id")}${linkedText ? `,${linkedText("source")},${linkedText("source_group")},${linkedText("task_request_id")}` : ""}))`;
  return `CASE WHEN ${hints} ~ '(inblackm_web|web-in)' THEN 'web'
    WHEN ${hints} ~ '(kaleoz)' THEN 'kaleoz' WHEN ${hints} ~ '(itemku)' THEN 'itemku'
    WHEN ${hints} ~ '(playerok)' THEN 'playerok' WHEN ${hints} ~ '(g2g)' THEN 'g2g'
    WHEN ${hints} ~ '(russia|russian|orderito|donatov)' THEN 'russia'
    WHEN ${hints} ~ '(page)' THEN 'page' ELSE 'telegram_other' END`;
}

export function buildSourceQuery(source, columns, { telegramAvailable = false, telegramColumns = [] } = {}) {
  if (![...BOT_SOURCES, WEB_SOURCE].includes(source)) throw new Error("Unknown workforce source");
  const map = new Map(columns.map(c => [c.column_name, c.data_type]));
  // Never convert whole production rows to JSON: they may contain large payloads
  // and credentials. Project only metadata columns discovered in the schema.
  const text = key => columnText(map, "r", key);
  const telegramMap = new Map(telegramColumns.map(c => [c.column_name, c.data_type]));
  const linkedText = key => columnText(telegramMap, "t", key);
  const times = source.time.filter(key => map.has(key));
  if (!map.has(source.key) || !times.length) return null;
  let time = `COALESCE(${times.map(key => map.get(key) === "timestamp without time zone"
    ? `r.${quote(key)} AT TIME ZONE 'Asia/Bangkok'` : `r.${quote(key)}::timestamptz`).join(",")}${times.length === 1 ? ",NULL::timestamptz" : ""})`;
  const linked = source.kind === "codashop" && telegramAvailable && map.has("telegram_task_request_id");
  const channel = source.channel ? `'${source.channel}'` : inferredChannel(text, linked ? linkedText : null);
  let key = `r.${quote(source.key)}::text`;
  if (source.kind === "codashop") key = `COALESCE(${linked ? "NULLIF(t.order_id,'')," : ""}${map.has("raw_data") ? "NULLIF(r.raw_data->>'order_id','')," : ""}${text("source_order_id")},${text("telegram_task_request_id")},'unlinked-'||r.id::text)`;
  // Remove transport prefixes and unit suffixes, never use UID/pack names as
  // identity. Queue references with the same customer order share a key.
  const identity = `regexp_replace(regexp_replace(regexp_replace(${key},'^(WEB-|kaleoz-|itemku-|playerok-)','','i'),':.*$',''),'#[0-9]+$','')`;
  const business = `CASE WHEN (${channel})='web' THEN regexp_replace(${identity},'^(IN[0-9]+-[0-9]+)-[0-9]+$','\\1') ELSE ${identity} END`;
  const status = `lower(COALESCE(${text("current_status")},${text("order_status")},${text("status")},'unknown'))`;
  const qty = map.has("quantity") ? "GREATEST(COALESCE(r.quantity,1),1)::numeric" : "1::numeric";
  const unit = source.kind === "codashop" ? `COALESCE(${text("source_order_id")},r.id::text)` : source.unit && map.has(source.unit) ? `r.${quote(source.unit)}::text` : key;
  const web = source === WEB_SOURCE;
  // An index-friendly lower bound for the first non-null timestamp. LEAST with
  // Telegram's timestamp can only move the event earlier, so this is also safe
  // for linked bot rows. Web GREATEST/payment timestamps need their own bound.
  const lowerBound = times.map((key, i) => {
    const boundary = map.get(key) === "timestamp without time zone"
      ? "$1::timestamptz AT TIME ZONE 'Asia/Bangkok'" : "$1::timestamptz";
    return `(${times.slice(0, i).map(previous => `r.${quote(previous)} IS NULL AND `).join("")}r.${quote(key)}>=(${boundary}))`;
  }).join(" OR ");
  if (linked) time = `LEAST(${time},t.created_at)`;
  if (web) time = `GREATEST(${time},o.payment_confirmed_at)`;
  return `SELECT (${channel}) AS channel, ${business} AS business_id, ${unit} AS unit_id,
    '${source.table}' AS origin, ${source.priority} AS priority, ${time} AS event_at,
    ${qty} AS units, ${status} AS state
    FROM public.${quote(source.table)} r
    ${linked ? "LEFT JOIN public.telegram_orders_dev t ON t.task_request_id=r.telegram_task_request_id" : ""}
    ${web ? "JOIN public.orders o ON o.id=r.order_id" : ""}
    WHERE ${web ? "" : `(${lowerBound}) AND `}${time}>=$1::timestamptz AND ${time}<$2::timestamptz
      AND r.${quote(source.key)} IS NOT NULL
      ${web ? "AND o.payment_confirmed_at IS NOT NULL" : ""}`;
}

export function aggregateSourceSql(parts, { excludeWeb = false } = {}) {
  if (!parts.length) return null;
  return `WITH raw AS (${parts.join("\nUNION ALL\n")}),
    ranked AS (SELECT *,dense_rank() OVER(PARTITION BY channel,business_id ORDER BY priority,origin) AS preference
      FROM raw WHERE business_id IS NOT NULL ${excludeWeb ? "AND channel<>'web'" : ""}),
    units AS (SELECT DISTINCT ON(channel,business_id,unit_id) * FROM ranked WHERE preference=1
      ORDER BY channel,business_id,unit_id,event_at),
    executions AS (SELECT channel,business_id,SUM(units) FILTER(WHERE state IN ('completed','success','delivered')) AS completed_units
      FROM (SELECT DISTINCT ON(channel,business_id,unit_id) * FROM raw WHERE origin='codashop_orders'
        ORDER BY channel,business_id,unit_id,event_at) x GROUP BY channel,business_id),
    canonical AS (SELECT channel,business_id,MIN(event_at) AS event_at,
      COALESCE(SUM(units) FILTER(WHERE state NOT IN ('cancelled','canceled','refunded','dibatalkan','7','1006','1406','return','rejected','expired','1001','1100','awaiting_payment','pending_payment','unpaid')),0) AS units,
      bool_and(state IN ('cancelled','canceled','refunded','dibatalkan','7','1006','1406','return','rejected','expired','1001','1100','awaiting_payment','pending_payment','unpaid')) AS cancelled,
      bool_and(state IN ('completed','success','done','delivered','selesai','4','1004','1005','1405','closed_partial','cancelled','canceled','refunded','1006','1406','return')) AS closed,
      bool_or(state NOT IN ('completed','success','done','delivered','selesai','4','1004','1005','1405','closed_partial',
        'cancelled','canceled','refunded','dibatalkan','7','1006','1406','return','rejected','expired','1001','1100','awaiting_payment','pending_payment','unpaid',
        'pending','processing','partial','new','accept','claimed','in_progress','synced','manual','manual_pending','disabled','unresolved','1002','1003','2','3','disputed','waiting','waiting_confirm')) AS unknown_status
      FROM units GROUP BY channel,business_id),
    resolved AS (SELECT c.*, c.closed OR COALESCE(e.completed_units>=c.units,false) AS resolved_closed
      FROM canonical c LEFT JOIN executions e USING(channel,business_id)),
    hourly AS (SELECT channel,date_trunc('hour',event_at) AS hour,
      COUNT(*) FILTER(WHERE NOT cancelled)::int AS orders,
      COALESCE(SUM(units) FILTER(WHERE NOT cancelled),0)::int AS units,
      COUNT(*) FILTER(WHERE NOT cancelled AND NOT resolved_closed)::int AS open_orders,
      COALESCE(SUM(units) FILTER(WHERE NOT cancelled AND NOT resolved_closed),0)::int AS open_units,
      COUNT(*) FILTER(WHERE cancelled)::int AS cancelled,
      COUNT(*) FILTER(WHERE unknown_status AND NOT resolved_closed)::int AS unknown_status
      FROM resolved GROUP BY channel,date_trunc('hour',event_at))
    SELECT * FROM hourly ORDER BY hour,channel`;
}
