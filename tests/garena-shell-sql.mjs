import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createGarenaShellInventory } from "../src/server/garena-shell-inventory.js";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`CREATE TABLE codashop_orders(id bigint,source_order_id text,game_name text,pack_name text,source text,
    created_at timestamptz,updated_at timestamptz,invoice_txn_id text,provider_response jsonb,
    telegram_task_request_id text,status text,uid text,payment_method text);
    CREATE TABLE telegram_orders_dev(task_request_id text,order_id text,price numeric,source text,method text,uid text,admin text,booked_by text);
    CREATE TABLE sheet_jobs(order_id text,source text,payload jsonb,target text,created_at timestamptz,id bigint);
    INSERT INTO telegram_orders_dev VALUES
    ('REUSED','OLD',150,'PAGE','uid','uid','Old staff',NULL),
    ('REUSED','NEW',570,'PAGE','uid','uid','New staff',NULL),
    ('AMBIGUOUS','X1',200,'PAGE','uid','uid','Staff',NULL),
    ('AMBIGUOUS','X2',400,'PAGE','uid','uid','Staff',NULL);`);
  const response = (username, before, after, used) => JSON.stringify({ garena_username: username, shell_balance_before: before,
    shell_balance_after: after, shell_used: used, session: 'SECRET_SESSION', cookies: 'SECRET_COOKIE' });
  const insert = (id, order, task, username, date, status = 'completed', before = 1000, after = 700, used = 300) => db.query(
    `INSERT INTO codashop_orders VALUES ($1,$2,'ROV','Pack','PAGE',$3,$3,'TX',$4::jsonb,$5,$6,'uid','GarenaShells')`,
    [id, order, date, response(username, before, after, used), task, status]);
  await insert(1, 'NEW:pack:1', 'REUSED', 'InblackWFH1z', '2026-10-18T00:00:00Z');
  await insert(2, 'NEW:pack:2', 'REUSED', 'InblackWFH1z', '2026-10-18T00:01:00Z');
  await insert(3, 'OLD:pack:1', 'REUSED', 'InblackWFH1z', '2026-09-01T00:00:00Z');
  await insert(4, 'OTHER:pack:1', 'REUSED', 'InblackKAN1aa', '2026-10-18T00:02:00Z');
  await insert(5, 'FAILED:pack:1', 'REUSED', 'InblackRB2c', '2026-10-18T00:03:00Z', 'failed');
  await insert(6, 'AMB:pack:1', 'AMBIGUOUS', 'InblackRB2c', '2026-10-18T00:04:00Z');
  await insert(7, 'ZERO:pack:1', 'ZERO', '  INBLACKRB2C ', '2026-10-19T00:00:00Z', 'completed', 300, 0, 300);
  const repo = createGarenaShellInventory({ select: async (sql, params) => {
    assert.ok(sql.trim().startsWith('SELECT'));
    const { rows } = await db.query(sql, params);
    assert.ok(!JSON.stringify(rows).includes('SECRET_'));
    return rows;
  }, prepareSales: async (data) => data });
  const actor = { permissions: ['projectm.claim'] }, query = { dateFrom: '2026-10-18', dateTo: '2026-10-18' };
  const result = await repo.list(actor, query);
  assert.equal(result.total, 3);
  assert.deepEqual(result.entries.map((entry) => entry.id), ['6', '2', '1']);
  assert.equal(result.entries.find((entry) => entry.id === '1').figures.sale, '285.00');
  assert.equal(result.entries.find((entry) => entry.id === '2').figures.sale, '285.00');
  assert.equal(result.entries.find((entry) => entry.id === '6').figures.sale, null);
  assert.equal(result.summary.sale, null);
  assert.equal(result.cards[0].balance, '0.00');
  assert.equal(result.cards[0].orders, 1);
  assert.equal(result.cards[1].orders, 2);
  assert.equal(result.summary.used, '900.00');
  assert.equal(result.summary.cost, '562.50');
  const one = await repo.list(actor, { ...query, account: 'inblackwfh1z', search: 'NEW' });
  assert.equal(one.total, 2);
  assert.equal(one.summary.sale, '570.00');
  assert.equal(one.cards.length, 2);
  assert.ok(!JSON.stringify(one).includes('Old staff'));

  // Regression: the /1 suffix belongs to the paid unit, not provider dispatch metadata.
  // The same task may also contain a parent-ID row or a distinct /2 sale with a different price.
  await db.exec(`INSERT INTO telegram_orders_dev VALUES
    ('SLASH-REUSED','IN430910-6066-1',999999,'PAGE','uid','uid','Wrong parent',NULL),
    ('SLASH-REUSED','IN430910-6066-1/1',475,'PAGE','uid','uid','Staff',NULL),
    ('SLASH-REUSED','IN430910-6066-1/2',100,'PAGE','uid','uid','Staff',NULL),
    ('SLASH-MULTI','IN430910-6066-1/9',570,'PAGE','uid','uid','Staff',NULL);`);
  await insert(10, 'IN430910-6066-1/1:dispatch-uuid:1', 'SLASH-REUSED', 'InblackWFH1z', '2026-10-17T14:52:51Z', 'completed', 69300, 68550, 750);
  await insert(11, 'IN430910-6066-1/2:dispatch-uuid:1', 'SLASH-REUSED', 'InblackWFH1z', '2026-10-17T14:53:00Z', 'completed', 68550, 68450, 100);
  await insert(12, 'IN430910-6066-1/9:dispatch-uuid:1', 'SLASH-MULTI', 'InblackWFH1z', '2026-10-17T14:54:00Z');
  await insert(13, 'IN430910-6066-1/9:dispatch-uuid:2', 'SLASH-MULTI', 'InblackWFH1z', '2026-10-17T14:55:00Z');
  const slash = await repo.list(actor, { dateFrom: '2026-10-17', dateTo: '2026-10-17' });
  assert.equal(slash.total, 4);
  const real = slash.entries.find((entry) => entry.id === '10');
  assert.equal(real.orderId, 'IN430910-6066-1/1');
  assert.deepEqual(real.figures, { sale: '475.00', cost: '468.75', profit: '6.25', margin: '1.32' });
  assert.equal(slash.entries.find((entry) => entry.id === '11').figures.sale, '100.00');
  assert.equal(slash.entries.find((entry) => entry.id === '12').figures.sale, '285.00');
  assert.equal(slash.entries.find((entry) => entry.id === '13').figures.sale, '285.00');
  assert.equal(slash.summary.sale, '1145.00');
  assert.ok(!JSON.stringify(slash).includes('Wrong parent'));
  const exactSlash = await repo.list(actor, { dateFrom: '2026-10-17', dateTo: '2026-10-17', search: 'IN430910-6066-1/1' }, { exportAll: true });
  assert.equal(exactSlash.total, 1);
  assert.equal(exactSlash.summary.sale, '475.00');
  console.log('Garena Shell SQL: reused tasks, exact order matching, pack allocation, ambiguous evidence, account isolation, range-independent zero balance and secret projections passed');
} finally { await db.close(); }
