import { getPool } from "@/lib/db";
import { selectQuery } from "@/lib/profit-remote-db";
import { gpColumns } from "@/server/gamepoint-inventory";
import { gpOrder, GAMEPOINT_METHOD, GAMEPOINT_RATE } from "@/lib/gamepoint-inventory";
import { plsAmount, plsWallet, PLSBUY_METHOD } from "@/lib/plsbuy-inventory";
import { SHELL_ACCOUNTS, SHELL_METHOD, shellAmount } from "@/lib/garena-shell-inventory";
import { NETEASE_ACCOUNTS, resolveNeteaseAccount, neteaseAmount } from "@/lib/netease-inventory";
import { RAZER_INVENTORY_ZONES, razerStockAccounts } from "@/lib/razer-inventory";
import { WAVE_PHONE_SQL, WAVEPAY_METHOD, kyat } from "@/lib/wavepay-inventory";
import { mgcPoints } from "@/lib/multigamecard-inventory";
import { getReadyPool } from "@/server/itune-entries-repository";
import { ITUNE_UNAVAILABLE_STATUS } from "@/lib/itune-status";
import { providerUsd } from "@/lib/usdcodashop-ledger";
import { loadDonshopWallet } from "@/server/donshop-inventory";
import { loadAgenh2hWallet } from "@/server/agenh2h-inventory";

const channel = (provider, id, label, currency, balance, balanceAt, source) => ({
  key: `${provider}:${id}`, provider, label: label.slice(0, 300), currency, balance,
  balanceAt: balanceAt ? new Date(balanceAt).toISOString() : null, source,
});
const queryPool = (pool) => async (sql, params) => (await pool.query(sql, params)).rows;


// Balance projections only: never read account passwords, PINs or full provider payloads.
export const balanceReaders = {
  async donshop(select) {
    const wallet = await loadDonshopWallet(select);
    return [channel("donshop", "IDR", "Donshop", "IDR", wallet?.amount ?? null, wallet?.checkedAt, "codashop_orders: before − debit")];
  },
  async agenh2h(select) {
    const wallet = await loadAgenh2hWallet(select);
    return [channel("agenh2h", "IDR", "AgenH2H", "IDR", wallet?.amount ?? null, wallet?.checkedAt, "codashop_orders: before − debit")];
  },
  async gamepoint(select) {
    const rows = await select(`SELECT c.id,c.source_order_id,c.created_at AS occurred_at,${gpColumns}
      FROM codashop_orders c WHERE c.payment_method=$1 AND c.status='completed'
      ORDER BY c.provider_response#>>'{_worker_meta,submitted_at}' DESC NULLS LAST,c.id DESC LIMIT 1`, [GAMEPOINT_METHOD]);
    const wallet = rows[0] ? gpOrder(rows[0], GAMEPOINT_RATE).wallet : null;
    return [channel("gamepoint", "MYR", "Gamepoint", "MYR", wallet?.amount ?? null, wallet?.checkedAt, "calculated: before − debit")];
  },
  async plsbuy(select) {
    const path = "c.provider_response#>'{_worker_meta,wallet_balance}'";
    const rows = await select(`SELECT c.id,c.source_order_id,${path}->>'after' AS wallet_after,
      ${path}->>'checked_at' AS wallet_checked_at,${path}->>'currency' AS wallet_currency,${path}->>'source' AS wallet_source
      FROM codashop_orders c WHERE c.payment_method=$1 AND c.status='completed'
        AND ${path}->>'currency'='MYR' AND ${path}->>'source'='plsbuy_api'
        AND (${path}->>'after') ~ '^[0-9]{1,12}(\\.[0-9]{1,20})?$'
        AND (${path}->>'checked_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
      ORDER BY ${path}->>'checked_at' DESC,c.id DESC LIMIT 1`, [PLSBUY_METHOD]);
    const wallet = plsWallet(rows[0]);
    const lots = wallet ? [] : await select(`SELECT CASE WHEN COUNT(*)>0 AND COUNT(remaining_balance)=COUNT(*)
      AND MIN(remaining_balance)>=0 THEN SUM(remaining_balance) END AS remaining,MAX(updated_at) AS observed_at
      FROM inventory_topups WHERE payment_method=$1 AND currency='MYR' AND status IN ('active','exhausted')`, [PLSBUY_METHOD]);
    return [channel("plsbuy", "MYR", "Plsbuy", "MYR", wallet?.amount ?? plsAmount(lots[0]?.remaining),
      wallet?.checkedAt ?? lots[0]?.observed_at, wallet ? "plsbuy_api" : "inventory_lots")];
  },
  async "garena-shell"(select) {
    const account = "lower(btrim(c.provider_response->>'garena_username'))";
    const rows = await select(`SELECT DISTINCT ON (${account}) ${account} AS account,
      COALESCE(c.provider_response->>'shell_balance_after',c.provider_response->>'shell_balance') AS balance,c.updated_at AS balance_at
      FROM codashop_orders c WHERE c.payment_method=$1 AND c.status='completed' AND ${account}=ANY($2::text[])
      ORDER BY ${account},c.updated_at DESC,c.id DESC`, [SHELL_METHOD, SHELL_ACCOUNTS.map(a => a.id)]);
    return SHELL_ACCOUNTS.map(a => {
      const row = rows.find(r => r.account === a.id);
      return channel("garena-shell", a.id, a.name, "Shell", shellAmount(row?.balance), row?.balance_at, "bot");
    });
  },
  async netease(select) {
    const rows = await select(`SELECT DISTINCT ON (lower(btrim(purchase_email)),COALESCE(currency,''))
      purchase_email,currency,new_balance,COALESCE(balance_received_at,created_at) AS balance_at,id
      FROM netease_purchase_history
      ORDER BY lower(btrim(purchase_email)),COALESCE(currency,''),COALESCE(balance_received_at,created_at) DESC,id DESC`);
    return NETEASE_ACCOUNTS.map(a => {
      const row = rows.filter(r => resolveNeteaseAccount(r)?.id === a.id)
        .sort((x,y) => new Date(y.balance_at) - new Date(x.balance_at) || Number(y.id) - Number(x.id))[0];
      return channel("netease", a.id, a.name, a.currency, neteaseAmount(row?.new_balance), row?.balance_at, "purchase_history");
    });
  },
  async wavepay(select) {
    const rows = await select(`SELECT DISTINCT ON (${WAVE_PHONE_SQL}) ${WAVE_PHONE_SQL} AS phone,
      c.provider_response#>>'{balances,newBalance}' AS balance,c.created_at AS balance_at
      FROM codashop_orders c WHERE c.payment_method=$1 AND c.status='completed'
      ORDER BY ${WAVE_PHONE_SQL},c.created_at DESC,c.id DESC`, [WAVEPAY_METHOD]);
    return rows.filter(r => r.phone).map(r => channel("wavepay", r.phone, `WavePay ${r.phone}`, "MMK", kyat(r.balance), r.balance_at, "bot"));
  },
  async razer(select) {
    const stockSelect = queryPool(getPool());
    // Purchase history can still supply balances when the stock table is unavailable.
    const stock = await stockSelect(`SELECT id,email,zone,rate,status,gold_balance,silver_balance,hidden,bot_enabled,last_synced_at,in_use_order_id
      FROM profit_razer_accounts WHERE zone=ANY($1::text[])`, [RAZER_INVENTORY_ZONES]).catch(() => []);
    const latest = await select(`SELECT DISTINCT ON (lower(btrim(purchase_email)),currency_code)
      purchase_email,currency_code,new_balance_gold,new_balance_silver,balance_received_at,completed_at,created_at AS occurred_at
      FROM razer_purchase_history WHERE status='completed' AND currency_code=ANY($1::text[])
      ORDER BY lower(btrim(purchase_email)),currency_code,COALESCE(balance_received_at,completed_at,created_at) DESC,id DESC`, [RAZER_INVENTORY_ZONES]);
    return razerStockAccounts(stock, latest).filter(a => !a.hidden)
      .map(a => channel("razer", a.key, `Razer ${a.email}`, a.zone, a.gold, a.balanceAt, a.balanceSource));
  },
  async multigamecard(select) {
    const rows = await select(`SELECT card->>'cardSerial' AS serial,card->>'balance' AS balance,
      card->>'balanceUpdatedAt' AS balance_at,card->>'enabled' AS enabled
      FROM system_settings s CROSS JOIN LATERAL jsonb_array_elements(s.setting_value::jsonb->'cards') card
      WHERE s.setting_key=$1`, ["oxide_payment_card"]);
    const cards = rows.filter(r => r.serial && r.enabled !== "false").map(r => channel("multigamecard", `bot:${r.serial}`,
      `Multigamecard Bot ${r.serial}`, "Points", rows.filter(x => x.serial === r.serial).length === 1 ? mgcPoints(r.balance) : null, r.balance_at, "bot_pool"));
    const manual = await queryPool(getPool())(`SELECT id,serial,balance_points,created_at,
      (SELECT MAX(e.occurred_at) FROM gamedb_mgc_entries e WHERE e.card_id=c.id) AS balance_at FROM gamedb_mgc_cards c`)
      .catch(error => { if (error.code === "42P01") return []; throw error; });
    return [...new Map(cards.map(c => [c.key,c])).values(), ...manual.map(r => channel("multigamecard", `manual:${r.id}`,
      `Multigamecard Manual ${r.serial}`, "Points", mgcPoints(r.balance_points), r.balance_at || r.created_at, "manual_ledger"))];
  },
  async usdcodashop() {
    const rows = await queryPool(getPool())(`SELECT latest.balance,latest.occurred_at AS balance_at,w.last_sync
      FROM gamedb_coda_wallet w LEFT JOIN LATERAL (
        SELECT l.details->>'providerBalance' AS balance,l.occurred_at FROM gamedb_coda_ledger l
        WHERE l.wallet_id=w.id AND l.kind='order' ORDER BY l.occurred_at DESC,l.source_id DESC LIMIT 1
      ) latest ON TRUE WHERE w.id=1`);
    return [{ ...channel("usdcodashop", "USD", "USDCodashop Bot", "USD", providerUsd(rows[0]?.balance), rows[0]?.balance_at,
      "codashop_orders / inventory_transactions → gamedb_coda_ledger"), syncedAt: rows[0]?.last_sync ?? null }];
  },
  async itune() {
    const rows = await queryPool(await getReadyPool())(`SELECT id,email,currency,amount,updated_at FROM projectm_itune_entries
      WHERE COALESCE(status,'')<>$1 AND btrim(COALESCE(currency,''))<>''`, [ITUNE_UNAVAILABLE_STATUS]);
    return rows.map(r => channel("itune", `${r.id}:${r.currency}`, `iTune ${r.email}`, r.currency, plsAmount(r.amount),
      r.updated_at, "itune_ledger (เวลาแก้ไขบัญชีล่าสุด)"));
  },
};

export async function loadAlertBalances(providers = Object.keys(balanceReaders), readers = balanceReaders) {
  const results = await Promise.all(providers.map(async provider => {
    try {
      const read = readers[provider];
      const channels = await read(selectQuery);
      return { channels, provider };
    } catch { return { provider, channels: [], error: "อ่านยอดไม่สำเร็จ" }; }
  }));
  return { channels: results.flatMap(r => r.channels), errors: results.filter(r => r.error).map(({provider,error}) => ({provider,error})) };
}
