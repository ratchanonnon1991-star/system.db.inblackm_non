// Read-only view of the TopUp website's own catalogue (games, packages and
// the forms customers fill in), through the external connection named
// "topup_web". GameInfo never writes here: the website clears its caches and
// keeps its audit log only when a change goes through its own admin, so a
// direct write would leave the public site stale and unrecorded.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecretByName } from "@/server/connections-repository";

export const TOPUP_WEB_CONNECTION_NAME = "topup_web";

async function getTopupWebPool() {
  const connection = await findConnectionWithSecretByName(TOPUP_WEB_CONNECTION_NAME);
  return connection ? getPoolForConnection(connection) : null;
}

// Where an editor goes to change what GameInfo only shows (Web ON, the
// customer form). Unset means no link.
export function topupWebAdminUrl() {
  const url = String(process.env.GAMEINFO_TOPUP_ADMIN_URL || "").trim();
  return /^https?:\/\//.test(url) ? url : null;
}

function bool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function webStatus(row) {
  return {
    isActive: bool(row.is_active),
    uidEnabled: bool(row.uid_topup_enabled),
    idpassEnabled: bool(row.idpass_topup_enabled),
  };
}

// The same columns can be missing on an older website schema; to_jsonb()
// lets those read as absent instead of failing the query.
const GAME_SUMMARY_SQL = `
  SELECT jsonb_build_object(
    'id', g.id, 'name', g.name, 'sort_order', g.sort_order,
    'is_active', to_jsonb(g)->'is_active',
    'uid_topup_enabled', to_jsonb(g)->'uid_topup_enabled',
    'idpass_topup_enabled', to_jsonb(g)->'idpass_topup_enabled'
  ) AS row
  FROM games g
  ORDER BY g.sort_order, g.name
`;

/** Every website game, light enough for a picker and the list page. Null when the connection is not set up. */
export async function listTopupWebGames() {
  const pool = await getTopupWebPool();
  if (!pool) return null;
  const result = await pool.query(GAME_SUMMARY_SQL);
  return result.rows.map(({ row }) => ({ id: String(row.id), name: row.name, ...webStatus(row) }));
}

function normalizeField(field, fallbackKey) {
  if (!field || typeof field !== "object" || field.enabled === false) return null;
  const type = String(field.type || "text");
  return {
    key: String(field.key || fallbackKey || ""),
    label: String(field.label || field.labelEn || field.key || fallbackKey || ""),
    type,
    required: field.required !== false,
    masked: type === "password",
    placeholder: String(field.placeholder || ""),
    options: Array.isArray(field.options)
      ? field.options.map((option) => String(option?.label || option?.value || "")).filter(Boolean)
      : [],
  };
}

// The UID form is its own field list plus the optional Zone ID and Server
// boxes the website keeps separately; ID-PASS forms come as login methods.
export function topupWebCustomerForms(row) {
  const uidFields = [
    ...((row.uid_form_config?.fields || []).map((field) => normalizeField(field))),
    normalizeField(row.zone_id_config, "zoneId"),
    row.server_config ? normalizeField({ type: "select", ...row.server_config }, "server") : null,
  ].filter(Boolean);
  const methods = (row.idpass_form_config?.methods || [])
    .filter((method) => method && method.enabled !== false)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((method) => ({
      id: String(method.id || ""),
      label: String(method.label || method.labelEn || method.id || ""),
      fields: (method.fields || []).map((field) => normalizeField(field)).filter(Boolean),
    }))
    .filter((method) => method.fields.length);
  return { uid: uidFields, idpass: methods, defaultIdpassMethodId: row.idpass_form_config?.defaultMethodId || null };
}

export function topupWebPackageIconHref(packageId, version) {
  return `/api/gameinfo/topup-web/package-icon/${encodeURIComponent(packageId)}?v=${encodeURIComponent(version)}`;
}

/** Every live website package, without icons, for a picker. Null when the connection is not set up. */
export async function listTopupWebPackages() {
  const pool = await getTopupWebPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT p.id, p.label, p.amount_display, p.package_type, p.is_active_uid, p.is_active_idpass, g.id::text AS game_id, g.name AS game_name
       FROM packages p
       INNER JOIN games g ON g.id = p.game_id
      WHERE p.archived_at IS NULL
      ORDER BY g.name, p.sort_order, p.id`
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    label: String(row.label || ""),
    amountDisplay: String(row.amount_display || ""),
    category: String(row.package_type || "").trim(),
    uidActive: bool(row.is_active_uid),
    idpassActive: bool(row.is_active_idpass),
    gameId: row.game_id,
    gameName: String(row.game_name || ""),
  }));
}

/** A website package's icon as stored: a data: URL, an http(s) URL, or "". */
export async function getTopupWebPackageIcon(packageId) {
  const pool = await getTopupWebPool();
  if (!pool) return "";
  const result = await pool.query(`SELECT to_jsonb(p)->>'icon' AS icon FROM packages p WHERE p.id::text = $1`, [String(packageId)]);
  return String(result.rows[0]?.icon || "");
}

/** One website game with its customer forms and live packages. Null when unknown or not connected. */
export async function getTopupWebGame(topupGameId) {
  if (!topupGameId) return null;
  const pool = await getTopupWebPool();
  if (!pool) return null;
  const gameResult = await pool.query(
    `SELECT to_jsonb(g) - 'thumbnail' - 'banner' - 'tag_icons' AS row FROM games g WHERE g.id = $1`,
    [String(topupGameId)]
  );
  const row = gameResult.rows[0]?.row;
  if (!row) return null;
  // The icon itself can be megabytes of base64, so only a link to it leaves
  // here: the image's own URL when it is one, else GameInfo's icon route
  // versioned by a hash of the stored value.
  const packResult = await pool.query(
    `SELECT to_jsonb(p) - 'icon' AS row,
            CASE WHEN to_jsonb(p)->>'icon' ~* '^https?://' THEN to_jsonb(p)->>'icon' END AS icon_href,
            CASE WHEN to_jsonb(p)->>'icon' LIKE 'data:image/%' THEN left(md5(to_jsonb(p)->>'icon'), 12) END AS icon_hash
     FROM packages p
     WHERE p.game_id = $1 AND (to_jsonb(p)->>'archived_at') IS NULL
     ORDER BY p.sort_order, p.id`,
    [String(topupGameId)]
  );
  return {
    id: String(row.id),
    name: row.name,
    ...webStatus(row),
    forms: topupWebCustomerForms(row),
    packages: packResult.rows.map(({ row: pack, icon_href: iconHref, icon_hash: iconHash }) => ({
      id: String(pack.id),
      image: iconHref || (iconHash ? topupWebPackageIconHref(pack.id, iconHash) : ""),
      label: String(pack.label || ""),
      amountDisplay: String(pack.amount_display || ""),
      isActive: bool(pack.is_active),
      uidActive: bool(pack.is_active_uid),
      idpassActive: bool(pack.is_active_idpass),
      price: number(pack.price),
      priceIdpass: number(pack.price_idpass),
      flashSalePrice: number(pack.flash_sale_price),
      cost: number(pack.cost),
      costUsd: number(pack.cost_usd),
      // The website's category for the pack ("Crystals", "Aurum Pass"...).
      category: String(pack.package_type || "").trim(),
    })),
  };
}

/** What a GameInfo game can take from its website game: the image and the categories. */
export async function getTopupWebGameAssets(topupGameId) {
  const pool = await getTopupWebPool();
  if (!pool || !topupGameId) return null;
  const result = await pool.query(
    `SELECT jsonb_build_object('id', g.id, 'name', g.name, 'thumbnail', g.thumbnail, 'tags', to_jsonb(g)->'tags') AS row
     FROM games g WHERE g.id = $1`,
    [String(topupGameId)]
  );
  const row = result.rows[0]?.row;
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name || ""),
    // Only an image the browser can show as-is; anything else is left out.
    thumbnail: /^(data:image\/|https?:\/\/)/.test(String(row.thumbnail || "")) ? String(row.thumbnail) : "",
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean) : [],
  };
}

export async function isTopupWebConnected() {
  return Boolean(await findConnectionWithSecretByName(TOPUP_WEB_CONNECTION_NAME));
}

/**
 * { [topupGameId]: { href } | { hash } } for the website games given that have a
 * thumbnail: its own https URL, or an md5 to version a route that serves the
 * stored data: URL (which can be megabytes, so it never leaves here in a list).
 * Empty when the connection is not set up.
 */
export async function listTopupWebGameThumbnails(topupGameIds) {
  const ids = [...new Set(topupGameIds.filter(Boolean).map(String))];
  const pool = ids.length ? await getTopupWebPool() : null;
  if (!pool) return {};
  const result = await pool.query(
    `SELECT g.id::text AS id,
            CASE WHEN g.thumbnail ~* '^https://' THEN g.thumbnail END AS href,
            CASE WHEN g.thumbnail LIKE 'data:image/%' THEN left(md5(g.thumbnail), 16) END AS hash
       FROM games g WHERE g.id::text = ANY($1::text[])`,
    [ids]
  );
  return Object.fromEntries(result.rows.filter((row) => row.href || row.hash).map((row) => [row.id, row.href ? { href: row.href } : { hash: row.hash }]));
}

/** One website game's thumbnail as stored (data: or http(s) URL), or "". */
export async function getTopupWebGameThumbnail(topupGameId) {
  const pool = topupGameId ? await getTopupWebPool() : null;
  if (!pool) return "";
  const result = await pool.query(`SELECT thumbnail FROM games WHERE id::text = $1`, [String(topupGameId)]);
  return String(result.rows[0]?.thumbnail || "");
}
