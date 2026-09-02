// Shared sale-platform ids for codashop_orders / telegram_orders_dev tags.
// Every profit feed used to carry its own copy of these maps — keep one
// source of truth so sale-price cards, order views, and DB detection agree.
import { selectQuery } from "@/lib/profit-remote-db";

export const PLATFORM_ALIASES = {
  russia: "russia_reseller",
  WEB: "inblackm_web",
  web: "inblackm_web",
  playerok_topupman: "playerok",
};

// telegram_orders_dev.source_group is the Telegram chat title, not a
// platform tag — map the handful of resale chats we care about.
export const SOURCE_GROUP_ALIASES = {
  kaleoz: "kaleoz",
  itemku: "itemku",
  "russia reseller": "russia_reseller",
  "uid russian order": "russia_reseller",
  "order russia inblackm": "russia_reseller",
  "logovo logov | orderito bot": "russia_reseller",
  "via 2fa (russian resellers)": "russia_reseller",
  "donatov.net (russia) x inblackm talk and topup": "russia_reseller",
};

// Internal / test tags — not resale channels for the sale-price sheet.
const PLATFORM_IGNORE = new Set(["telegram", "CODA", "testbot"]);

export function normalizeSalePlatform(raw) {
  if (raw == null || raw === "") return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const mapped = PLATFORM_ALIASES[trimmed] ?? PLATFORM_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  return PLATFORM_IGNORE.has(mapped) ? null : mapped;
}

export function platformFromSourceGroup(group) {
  if (!group) return null;
  return normalizeSalePlatform(SOURCE_GROUP_ALIASES[String(group).trim().toLowerCase()] || null);
}

const DETECTED_CACHE_MS = 30_000;
let detectedCache = { at: 0, data: null };

// Distinct resale platforms seen on any completed codashop order — same
// COALESCE chain as WavePay/Oxide (source, telegram source, task-id prefix)
// plus source_group chat-title mapping. GoCash-only detection missed itemku
// and playerok because those orders are funded through other payment methods.
export async function listDetectedSalePlatforms() {
  const now = Date.now();
  if (detectedCache.data && now - detectedCache.at < DETECTED_CACHE_MS) {
    return detectedCache.data;
  }
  const rows = await selectQuery(
    `SELECT DISTINCT
            COALESCE(
              NULLIF(TRIM(c.source), ''),
              NULLIF(TRIM(t.source), ''),
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-'
                THEN split_part(c.telegram_task_request_id, '-', 1)
              END
            ) AS raw_platform,
            t.source_group
     FROM codashop_orders c
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     WHERE c.status = 'completed'`
  );
  const platforms = new Set();
  for (const row of rows) {
    const fromRaw = normalizeSalePlatform(row.raw_platform);
    if (fromRaw) platforms.add(fromRaw);
    const fromGroup = platformFromSourceGroup(row.source_group);
    if (fromGroup) platforms.add(fromGroup);
  }
  const data = [...platforms].sort((a, b) => a.localeCompare(b));
  detectedCache = { at: now, data };
  return data;
}
