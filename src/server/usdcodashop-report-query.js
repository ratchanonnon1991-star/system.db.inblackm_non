// Hydrate complete fill JSON only after selecting the requested customer-order page.
export const CODA_REPORT_SQL = `WITH duplicate_invoices AS MATERIALIZED (
          SELECT btrim(tx) AS invoice FROM gamedb_coda_ledger
          CROSS JOIN LATERAL unnest(string_to_array(details->>'invoice',',')) tx
          WHERE kind='order' AND btrim(tx)<>'' GROUP BY btrim(tx) HAVING COUNT(DISTINCT id)>1
        ), ordered AS (
          SELECT l.*, COUNT(*) FILTER(WHERE kind='order') OVER(PARTITION BY order_label) AS order_occurrences,
            EXISTS(SELECT 1 FROM duplicate_invoices d WHERE d.invoice=ANY(
              SELECT btrim(tx) FROM unnest(string_to_array(l.details->>'invoice',',')) tx)) AS transaction_duplicate,
            w.opening + SUM(CASE WHEN kind='deposit' THEN amount ELSE -amount END)
            OVER(ORDER BY l.occurred_at,l.id ROWS UNBOUNDED PRECEDING) AS balance
          FROM gamedb_coda_ledger l CROSS JOIN gamedb_coda_wallet w
        ), group_stats AS (
          SELECT kind,CASE WHEN kind='deposit' THEN id::text ELSE order_label END AS group_key,
            COALESCE(NULLIF(lower(details->>'source'),''),'unknown:'||source_id::text) AS group_source,
            COUNT(*) AS fill_count,SUM(amount) AS group_amount,
            BOOL_OR(transaction_duplicate) AS group_transaction_duplicate,
            CASE WHEN COUNT(*) FILTER(WHERE NOT COALESCE(btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$',FALSE))=0
              THEN SUM(CASE WHEN btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$' THEN round((details->>'saleThb')::numeric,2) END) END AS group_sale,
            CASE WHEN COUNT(*) FILTER(WHERE NOT COALESCE(btrim(details->>'costThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$',FALSE))=0
              THEN SUM(CASE WHEN btrim(details->>'costThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$' THEN round((details->>'costThb')::numeric,2) END) END AS group_original_cost,
            COUNT(DISTINCT ROW(COALESCE(details->>'saleTotalThb',details->>'saleNative'),details->>'saleCurrency')) AS receipt_variants,
            string_agg(DISTINCT details->>'game',' + ') AS group_game,
            string_agg(DISTINCT details->>'pack',' + ') AS group_pack,
            string_agg(DISTINCT details->>'invoice',', ') AS group_invoice
          FROM ordered GROUP BY 1,2,3
        ), heads AS (
          SELECT DISTINCT ON (kind,CASE WHEN kind='deposit' THEN id::text ELSE order_label END,
            COALESCE(NULLIF(lower(details->>'source'),''),'unknown:'||source_id::text)) *
          FROM ordered ORDER BY kind,CASE WHEN kind='deposit' THEN id::text ELSE order_label END,
            COALESCE(NULLIF(lower(details->>'source'),''),'unknown:'||source_id::text),
            occurred_at DESC,source_id DESC NULLS LAST,id DESC
        ), grouped AS (
          SELECT h.id,h.kind,h.source_id,h.order_label,g.group_amount AS amount,h.occurred_at,h.recorded_at,h.actor_label,h.balance,
            1 AS order_occurrences,g.group_transaction_duplicate AS transaction_duplicate,g.fill_count,g.group_key,g.group_source,
            CASE WHEN g.fill_count=1 THEN h.details ELSE
              (h.details - 'salePacks' - 'saleNative' - 'saleCurrency' - 'saleConversion' - 'saleAllocation') || jsonb_build_object(
                'saleThb',CASE WHEN g.receipt_variants>1 THEN NULL ELSE g.group_sale::text END,
                'costThb',g.group_original_cost::text,'game',g.group_game,'pack',g.group_pack,'invoice',g.group_invoice
              ) END AS details
          FROM heads h JOIN group_stats g ON g.kind=h.kind
            AND g.group_key=CASE WHEN h.kind='deposit' THEN h.id::text ELSE h.order_label END
            AND g.group_source IS NOT DISTINCT FROM COALESCE(NULLIF(lower(h.details->>'source'),''),'unknown:'||h.source_id::text)
        ), filtered AS (SELECT * FROM grouped WHERE ($1='' OR
          strpos(lower(concat_ws(' ',order_label,details->>'game',details->>'pack',details->>'operator',details->>'invoice',details->>'customer',details->>'playerId',details->>'note')),lower($1))>0)
          AND ($3::timestamptz IS NULL OR occurred_at >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR occurred_at < $4::timestamptz)
          AND ($6::text='all' OR kind=$6::text)), figures AS (
          SELECT *,
            CASE WHEN btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$'
              THEN round(btrim(details->>'saleThb')::numeric,2) END AS sale_thb,
            CASE WHEN kind='order' AND $7::numeric IS NOT NULL AND round(amount*$7::numeric,2)<=999999999999.99
              THEN round(amount*$7::numeric,2) END AS cost_thb
          FROM filtered
        ), measured AS (
          SELECT *, CASE WHEN kind='order' THEN
            CASE WHEN $9::text='percent' THEN round((sale_thb-cost_thb)/NULLIF(sale_thb,0)*100,2)
              ELSE sale_thb-cost_thb END END AS profit_value
          FROM figures
        ), matched AS (
          SELECT * FROM measured WHERE
            ($8::text='all' AND $10::numeric IS NULL AND $11::numeric IS NULL)
            OR (kind='order'
              AND ($8::text='all' OR ($8::text='profit' AND profit_value>0)
                OR ($8::text='loss' AND profit_value<0) OR ($8::text='breakeven' AND profit_value=0)
                OR ($8::text='missing' AND profit_value IS NULL))
              AND ($10::numeric IS NULL OR profit_value >= $10::numeric)
              AND ($11::numeric IS NULL OR profit_value <= $11::numeric))
        )
        , page_rows AS MATERIALIZED (
          SELECT * FROM matched ORDER BY occurred_at DESC,id DESC LIMIT $5 OFFSET $2
        ), page_fills AS (
          SELECT p.id,JSONB_AGG(to_jsonb(o) ORDER BY o.occurred_at DESC,o.source_id DESC NULLS LAST,o.id DESC) AS fills
          FROM page_rows p JOIN ordered o ON o.kind=p.kind
            AND CASE WHEN o.kind='deposit' THEN o.id::text ELSE o.order_label END=p.group_key
            AND COALESCE(NULLIF(lower(o.details->>'source'),''),'unknown:'||o.source_id::text) IS NOT DISTINCT FROM p.group_source
          GROUP BY p.id
        )
        SELECT w.*,
          COALESCE((SELECT SUM(amount) FROM ordered WHERE kind='deposit'),0)::text AS deposits,
          COALESCE((SELECT SUM(amount) FROM ordered WHERE kind='order'),0)::text AS used,
          (SELECT COUNT(*)::int FROM matched) AS total,
          (SELECT jsonb_build_object(
            'orders',COUNT(*) FILTER(WHERE kind='order'),
            'deposits',COUNT(*) FILTER(WHERE kind='deposit'),
            'sale',CASE WHEN COUNT(*) FILTER(WHERE kind='order' AND sale_thb IS NULL)=0
              THEN COALESCE(SUM(sale_thb) FILTER(WHERE kind='order'),0)::text END,
            'cost',CASE WHEN COUNT(*) FILTER(WHERE kind='order' AND cost_thb IS NULL)=0
              THEN COALESCE(SUM(cost_thb) FILTER(WHERE kind='order'),0)::text END,
            'profit',CASE WHEN COUNT(*) FILTER(WHERE kind='order' AND (sale_thb IS NULL OR cost_thb IS NULL))=0
              THEN COALESCE(SUM(sale_thb-cost_thb) FILTER(WHERE kind='order'),0)::text END,
            'missingSales',COUNT(*) FILTER(WHERE kind='order' AND sale_thb IS NULL),
            'missingCosts',COUNT(*) FILTER(WHERE kind='order' AND cost_thb IS NULL),
            'duplicateOrders',COUNT(*) FILTER(WHERE kind='order' AND order_occurrences>1),
            'duplicateTransactions',COUNT(*) FILTER(WHERE kind='order' AND transaction_duplicate),
            'depositUsd',COALESCE(SUM(amount) FILTER(WHERE kind='deposit'),0)::text,
            'usedUsd',COALESCE(SUM(amount) FILTER(WHERE kind='order'),0)::text
          ) FROM matched) AS summary,
          COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC,x.id DESC) FROM
            (SELECT p.*,f.fills FROM page_rows p JOIN page_fills f ON f.id=p.id) x),'[]'::jsonb) AS entries
        , (SELECT row_to_json(s) FROM gamedb_coda_sync_status s WHERE s.id=1) AS auto_sync
        , (SELECT jsonb_build_object('balance',details->>'providerBalance','orderId',order_label,'occurredAt',occurred_at)
           FROM ordered WHERE kind='order' ORDER BY occurred_at DESC,source_id DESC LIMIT 1) AS latest_provider
        FROM gamedb_coda_wallet w WHERE w.id=1`;
