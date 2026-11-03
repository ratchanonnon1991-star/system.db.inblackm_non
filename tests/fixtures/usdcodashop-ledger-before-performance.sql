WITH duplicate_invoices AS (
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
        ), rolled AS (
          SELECT o.*,ROW_NUMBER() OVER customer_order AS group_rank,
            COUNT(*) OVER customer_order AS fill_count,SUM(amount) OVER customer_order AS group_amount,
            JSONB_AGG(to_jsonb(o)) OVER customer_order AS fills,
            BOOL_OR(transaction_duplicate) OVER customer_order AS group_transaction_duplicate,
            CASE WHEN COUNT(*) FILTER(WHERE NOT COALESCE(btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$',FALSE)) OVER customer_order=0
              THEN SUM(CASE WHEN btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$' THEN round((details->>'saleThb')::numeric,2) END) OVER customer_order END AS group_sale,
            CASE WHEN COUNT(*) FILTER(WHERE NOT COALESCE(btrim(details->>'costThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$',FALSE)) OVER customer_order=0
              THEN SUM(CASE WHEN btrim(details->>'costThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$' THEN round((details->>'costThb')::numeric,2) END) OVER customer_order END AS group_original_cost
          FROM ordered o WINDOW customer_order AS (
            PARTITION BY kind,CASE WHEN kind='deposit' THEN id::text ELSE order_label END,
              COALESCE(NULLIF(lower(details->>'source'),''),'unknown:'||source_id::text)
            ORDER BY occurred_at DESC,source_id DESC NULLS LAST,id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
        ), grouped AS (
          SELECT id,kind,source_id,order_label,group_amount AS amount,occurred_at,recorded_at,actor_label,balance,
            1 AS order_occurrences,group_transaction_duplicate AS transaction_duplicate,fill_count,fills,
            CASE WHEN fill_count=1 THEN details ELSE
              (details - 'salePacks' - 'saleNative' - 'saleCurrency' - 'saleConversion' - 'saleAllocation') || jsonb_build_object(
                'saleThb',CASE WHEN (SELECT COUNT(DISTINCT ROW(
                    COALESCE(f->'details'->>'saleTotalThb',f->'details'->>'saleNative'),f->'details'->>'saleCurrency'))
                    FROM jsonb_array_elements(fills) f)>1 THEN NULL ELSE group_sale::text END,
                'costThb',group_original_cost::text,
                'game',(SELECT string_agg(DISTINCT f->'details'->>'game',' + ') FROM jsonb_array_elements(fills) f),
                'pack',(SELECT string_agg(DISTINCT f->'details'->>'pack',' + ') FROM jsonb_array_elements(fills) f),
                'invoice',(SELECT string_agg(DISTINCT f->'details'->>'invoice',', ') FROM jsonb_array_elements(fills) f)
              ) END AS details
          FROM rolled WHERE group_rank=1
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
            (SELECT * FROM matched ORDER BY occurred_at DESC,id DESC LIMIT $5 OFFSET $2) x),'[]'::jsonb) AS entries
        , (SELECT row_to_json(s) FROM gamedb_coda_sync_status s WHERE s.id=1) AS auto_sync
        , (SELECT jsonb_build_object('balance',details->>'providerBalance','orderId',order_label,'occurredAt',occurred_at)
           FROM ordered WHERE kind='order' ORDER BY occurred_at DESC,source_id DESC LIMIT 1) AS latest_provider
        FROM gamedb_coda_wallet w WHERE w.id=1
