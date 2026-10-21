import { selectQuery } from "@/lib/profit-remote-db";
import { CODA_BOUNDARY, CODA_METHOD } from "@/lib/usdcodashop-ledger";
import { inventoryError } from "@/lib/usdcodashop-inventory";
import { listingFields } from "@/lib/usdcodashop-sheet";
import { saleJoin } from "@/server/garena-shell-inventory";

// Shared by every completed codashop_orders reader: sale fields from sheet_jobs plus the pack split.
export async function attachSheetFields(select, rows, { exactAllocation = false } = {}) {
  if (!rows.length) return [];
  const keyOf = (r) => String(r.sale_order_id || r.source_base || r.source_order_id || r.id);
  const keys = [...new Set(rows.map(keyOf))];
  // A customer order with N packs becomes N completed Codashop rows sharing one sale price.
  // Count across the whole table (not this page) so siblings on another page still split the sale.
  const packs = await select(`SELECT COALESCE(NULLIF(t.order_id::text,''),NULLIF(split_part(c.source_order_id::text,':',1),''),c.id::text) AS sale_key,
    lower(COALESCE(NULLIF(c.source,''),t.source,'')) AS sale_source,
    COUNT(DISTINCT c.id)::int AS pack_count,ARRAY_AGG(DISTINCT c.id ORDER BY c.id) AS pack_ids
    FROM codashop_orders c ${saleJoin}
    WHERE c.status='completed' AND (t.order_id::text=ANY($1::text[]) OR split_part(c.source_order_id::text,':',1)=ANY($1::text[]))
    GROUP BY 1,2`, [keys]);
  const packGroups = new Map(packs.map((p) => [JSON.stringify([String(p.sale_key), String(p.sale_source || "")]), p]));
  // Batch only approved fields, never passwords/raw payloads or receipt URLs.
  const listings = await select(`SELECT DISTINCT ON (order_id,source) order_id,source AS listing_source,
    payload->>'amount' AS sale_amount,payload->>'buyer' AS buyer,payload->>'link' AS link,
    payload->>'uid' AS player_id,payload->>'filler' AS filler
    FROM sheet_jobs WHERE order_id=ANY($1::text[]) AND target='marketplace'
      AND source IN ('kaleoz','itemku','playerok','playerok-topupman','g2g','coda-worker')
    ORDER BY order_id,source,created_at DESC,id DESC`, [keys]);
  return rows.map((row) => {
    const key = keyOf(row), source = String(row.source || row.telegram_source || "").toLowerCase();
    const matches = listings.filter((l) => String(l.order_id) === key);
    const listing = matches.find((l) => l.listing_source === source) || {};
    const filler = matches.find((l) => l.listing_source === "coda-worker")?.filler;
    const group = packGroups.get(JSON.stringify([key, source])) || (!exactAllocation ? packs.find((p) => String(p.sale_key) === key) : null);
    // Other inventory readers retain their existing per-pack contract. Only the
    // USD ledger prepares the whole payment before allocating exact satang.
    if (!exactAllocation) return { ...row, sheet_fields: listingFields({ ...row, pack_count: group?.pack_count }, { ...listing, filler }) };
    const ids = (group?.pack_ids || []).map(String), position = ids.indexOf(String(row.id));
    const fields = listingFields({ ...row, pack_count: 1 }, { ...listing, filler });
    fields.saleAllocation = { count: Number(group?.pack_count || 0), position };
    if (row.sale_ambiguous || position < 0 || ids.length !== Number(group?.pack_count)) {
      fields.saleThb = null; fields.saleNative = null; fields.saleCurrency = null; fields.saleAmbiguous = true;
    }
    return { ...row, sheet_fields: fields };
  });
}

export function createCodaSource(select = selectQuery) {
  return {
    async boundary() {
      const rows = await select(`SELECT DISTINCT c.id FROM codashop_orders c
        LEFT JOIN telegram_orders_dev t ON t.task_request_id=c.telegram_task_request_id
        WHERE (c.source_order_id=$1 OR t.order_id=$1) AND c.payment_method=$2 AND c.status='completed'`, [CODA_BOUNDARY, CODA_METHOD]);
      if (rows.length !== 1) throw inventoryError("ไม่พบรายการอ้างอิง K7306171 ที่ตรงกันเพียงรายการเดียว จึงยังไม่หักยอด", 409);
      return String(rows[0].id);
    },
    async orders(boundaryId) {
      let cursor = boundaryId; const all = [];
      // Re-scan from the fixed boundary: late completions are not lost. Local unique keys deduplicate.
      for (let page = 0; page < 50; page++) {
        const rows = await select(`SELECT c.id,c.source_order_id,c.game_name,c.pack_name,c.payment_method,c.status,c.source,
          split_part(c.source_order_id::text,':',1) AS source_base,t.sale_ambiguous,
          t.order_id AS sale_order_id,t.price::text AS sale_price,t.source AS telegram_source,t.method,
          COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
          COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator,
          inv.transaction_count,inv.amount_used,inv.cost_thb,inv.balance_after,
          (inv.occurred_at AT TIME ZONE 'Asia/Bangkok') AS occurred_at,
          (SELECT string_agg(e->>'orderId', ', ') FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.provider_response)='array' THEN c.provider_response ELSE '[]'::jsonb END) e) AS invoice_number
          FROM codashop_orders c
          ${saleJoin}
          LEFT JOIN LATERAL (SELECT COUNT(*)::int AS transaction_count,MIN(amount_used) AS amount_used,
            MIN(cost_thb) AS cost_thb,MIN(balance_after) AS balance_after,MIN(created_at) AS occurred_at
            FROM inventory_transactions WHERE order_id=c.id) inv ON TRUE
          WHERE c.id>$1 AND c.payment_method=$2 AND c.status='completed' ORDER BY c.id LIMIT 500`, [cursor, CODA_METHOD]);
        all.push(...await attachSheetFields(select, rows, { exactAllocation: true }));
        if (rows.length < 500) return all;
        cursor = String(rows.at(-1).id);
      }
      throw inventoryError("ประวัติมากเกินขอบเขตซิงก์ครั้งนี้ ยังไม่ได้เปลี่ยนยอด กรุณาติดต่อผู้ดูแล", 409);
    },
  };
}
