import { getPool } from "@/lib/db";
import { alertTarget, isLowStock, stockAlertText } from "@/lib/inventory-alerts";
import { inventoryError, canManageUsdInventory } from "@/lib/usdcodashop-inventory";
import { loadAlertBalances } from "@/server/inventory-alert-balances";

export const telegramConfigured = (env = process.env) => Boolean(env.TOPUP_TELEGRAM_BOT_TOKEN && env.TOPUP_TELEGRAM_CHAT_ID);
export async function sendStockTelegram(text, { env = process.env, fetcher = fetch } = {}) {
  if (!telegramConfigured(env)) throw new Error("TELEGRAM_NOT_CONFIGURED");
  // Never log the URL or Telegram error object: the URL contains the bot token.
  try {
    const response = await fetcher(`https://api.telegram.org/bot${env.TOPUP_TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ chat_id: env.TOPUP_TELEGRAM_CHAT_ID, text, link_preview_options: { is_disabled: true } }),
    });
    if (!response.ok || (await response.json()).ok !== true) throw new Error();
  } catch { throw new Error("TELEGRAM_SEND_FAILED"); }
}

export function createInventoryAlerts({ pool = getPool(), balances = loadAlertBalances, send = sendStockTelegram } = {}) {
  let schema;
  async function ensure() {
    schema ||= pool.query(`CREATE TABLE IF NOT EXISTS gamedb_inventory_alerts (
      channel_key TEXT PRIMARY KEY, provider TEXT NOT NULL, label TEXT NOT NULL, currency TEXT NOT NULL,
      target NUMERIC(14,2) NOT NULL CHECK(target>0), notified BOOLEAN NOT NULL DEFAULT FALSE,
      last_sent_at TIMESTAMPTZ, last_checked_at TIMESTAMPTZ, last_balance NUMERIC(14,2), last_error TEXT,
      updated_by INTEGER NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(error => { schema = null; throw error; });
    await schema;
  }
  return {
    async list() {
      await ensure();
      const [{ rows }, snapshot] = await Promise.all([pool.query("SELECT * FROM gamedb_inventory_alerts ORDER BY channel_key"), balances()]);
      const saved = new Map(rows.map(r => [r.channel_key, r]));
      const channels = snapshot.channels.map(c => ({ ...c, target: saved.get(c.key)?.target ?? null,
        lastSentAt: saved.get(c.key)?.last_sent_at ?? null, lastCheckedAt: saved.get(c.key)?.last_checked_at ?? null,
        lastError: saved.get(c.key)?.last_error ?? null }));
      const keys = new Set(channels.map(c => c.key));
      for (const row of rows) if (!keys.has(row.channel_key)) channels.push({ key: row.channel_key, provider: row.provider,
        label: row.label, currency: row.currency, balance: null, balanceAt: null, source: "unavailable",
        target: row.target, lastSentAt: row.last_sent_at, lastCheckedAt: row.last_checked_at,
        lastError: row.provider === "usdcodashop" && row.channel_key !== "usdcodashop:USD"
          ? "รายการยอดกรอกมือเดิม: กรุณาตั้งเป้าหมายที่ USDCodashop Bot แล้วล้างเป้าหมายรายการนี้"
          : row.last_error || "ไม่พบยอดล่าสุด บัญชีอาจถูกปิดหรืออ่านข้อมูลไม่สำเร็จ" });
      return { channels, errors: snapshot.errors, telegramConfigured: telegramConfigured(), workerEnabled: process.env.TOPUP_INVENTORY_ALERTS_ENABLED === "true" };
    },
    async save(body, actor) {
      if (!canManageUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ตั้งค่าแจ้งเตือน Inventory", 403);
      if (!body || typeof body.key !== "string" || body.key.length > 400) throw inventoryError("ช่องทางไม่ถูกต้อง");
      const target = alertTarget(body.target);
      await ensure();
      if (target === null) {
        await pool.query("DELETE FROM gamedb_inventory_alerts WHERE channel_key=$1", [body.key]);
        return;
      }
      const provider = body.key.split(":", 1)[0];
      if (!["gamepoint", "plsbuy", "donshop", "agenh2h", "razer", "netease", "garena-shell", "itune", "wavepay", "usdcodashop", "multigamecard"].includes(provider)) throw inventoryError("ช่องทางไม่ถูกต้อง");
      const snapshot = await balances([provider]), c = snapshot.channels.find(c => c.key === body.key);
      if (!c) throw inventoryError("ไม่พบช่องทาง กรุณาโหลดข้อมูลใหม่", 409);
      // Editing the same target preserves the latch; changing it starts a new alert cycle.
      await pool.query(`INSERT INTO gamedb_inventory_alerts(channel_key,provider,label,currency,target,updated_by)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(channel_key) DO UPDATE SET
        target=EXCLUDED.target,notified=CASE WHEN gamedb_inventory_alerts.target=EXCLUDED.target THEN gamedb_inventory_alerts.notified ELSE FALSE END,
        label=EXCLUDED.label,currency=EXCLUDED.currency,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [c.key, c.provider, c.label, c.currency, target, actor.id]);
    },
    async run() {
      await ensure();
      const client = await pool.connect();
      let locked = false, sent = 0, skipped = 0, failed = 0;
      try {
        locked = (await client.query("SELECT pg_try_advisory_lock(hashtext('gamedb-inventory-alerts')) AS locked")).rows[0].locked;
        if (!locked) return { sent, skipped, failed };
        const { rows } = await client.query("SELECT provider FROM gamedb_inventory_alerts");
        if (!rows.length) return { sent, skipped, failed };
        const snapshot = await balances([...new Set(rows.map(r => r.provider))]);
        const byKey = new Map(snapshot.channels.map(c => [c.key, c]));
        // Lock settings through delivery so a concurrent edit cannot latch a different target.
        await client.query("BEGIN");
        const rules = (await client.query("SELECT * FROM gamedb_inventory_alerts ORDER BY channel_key FOR UPDATE")).rows;
        const pending = [];
        for (const rule of rules) {
          const c = byKey.get(rule.channel_key), low = c?.currency === rule.currency ? isLowStock(c.balance, rule.target) : null;
          await client.query(`UPDATE gamedb_inventory_alerts SET last_checked_at=NOW(),last_balance=$2,last_error=$3,
            notified=CASE WHEN $4::boolean=FALSE THEN FALSE ELSE notified END WHERE channel_key=$1`,
          [rule.channel_key, low === null ? null : c.balance, low === null ? "ไม่มียอดที่ยืนยันได้" : null, low]);
          if (low === null) skipped++;
          else if (low && !rule.notified) pending.push({ rule, c });
        }
        // One message per cycle avoids Telegram's per-chat rate limit for many low wallets.
        // Split by message length; labels are plain text, never interpreted as markup.
        const batches = [];
        for (const item of pending) {
          const message = stockAlertText(item.c, item.rule.target);
          const batch = batches.at(-1);
          if (!batch || batch.text.length + message.length + 2 > 3800) batches.push({ text: message, items: [item] });
          else { batch.text += `\n\n${message}`; batch.items.push(item); }
        }
        for (const batch of batches) {
          // shortcut: ambiguous Telegram/DB failures can duplicate delivery; add reconciliation if exact-once delivery is required.
          try { await send(batch.text); }
          catch {
            for (const { rule } of batch.items) await client.query("UPDATE gamedb_inventory_alerts SET last_error=$2 WHERE channel_key=$1", [rule.channel_key, "ส่ง Telegram ไม่สำเร็จ จะลองใหม่รอบถัดไป"]);
            failed += batch.items.length;
            break;
          }
          for (const { rule } of batch.items) {
            await client.query("UPDATE gamedb_inventory_alerts SET notified=TRUE,last_sent_at=NOW() WHERE channel_key=$1", [rule.channel_key]);
            sent++;
          }
        }
        await client.query("COMMIT");
        return { sent, skipped, failed };
      } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
      finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('gamedb-inventory-alerts'))").catch(() => {});
        client.release();
      }
    },
  };
}
let repository;
export const inventoryAlerts = () => repository ||= createInventoryAlerts();
