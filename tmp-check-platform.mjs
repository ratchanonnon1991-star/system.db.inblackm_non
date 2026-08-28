import fs from "fs";
import pg from "pg";

for (const line of fs.readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const client = new pg.Client({ connectionString: process.env.PROFIT_DATABASE_URL, ssl: false });
await client.connect();

console.log("=== WavePay orders joined to telegram_orders_dev, by resulting platform ===");
console.log((await client.query(
  `SELECT
     COALESCE(
       t.source,
       CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
     ) AS platform,
     count(*)
   FROM codashop_orders c
   LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
   WHERE c.payment_method = 'WavePay' AND c.status = 'completed'
   GROUP BY platform ORDER BY count(*) DESC`
)).rows);

console.log("\n=== Same but only current logic (prefix-only, no telegram_orders_dev join) ===");
console.log((await client.query(
  `SELECT
     CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END AS platform,
     count(*)
   FROM codashop_orders c
   WHERE c.payment_method = 'WavePay' AND c.status = 'completed'
   GROUP BY platform ORDER BY count(*) DESC`
)).rows);

console.log("\n=== telegram_orders_dev.price for wavepay-matched rows (sample, for cost feasibility) ===");
console.log((await client.query(
  `SELECT t.source, t.price, count(*)
   FROM codashop_orders c
   JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
   WHERE c.payment_method = 'WavePay' AND c.status = 'completed'
   GROUP BY t.source, t.price ORDER BY count(*) DESC LIMIT 10`
)).rows);

await client.end();
