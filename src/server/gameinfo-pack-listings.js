// Where a game's packs are listed for sale, one row per pack and channel, and
// whether each listed price was checked (src/lib/gameinfo-pack-listings.js).
// Saving a listing sends it back to "pending": a changed price needs a new check,
// and the one who listed a pack cannot be the one who checks it.
import { getGameinfoPool } from "@/server/gameinfo-gamelist-packs";
import {
  GAMEINFO_LISTING_STATUSES,
  isGameinfoListingChannel,
  isGameinfoListingUrl,
  parseGameinfoListingPrice,
} from "@/lib/gameinfo-pack-listings";

const COLUMNS = "pack_id, channel, url, listed_price, listed_by, listed_at, status, checked_price, checked_reference, reviewed_by, reviewed_at, note";

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
const toTime = (value) => (value ? new Date(value).toISOString() : null);

function toListing(row) {
  return {
    packId: row.pack_id,
    channel: row.channel,
    url: row.url,
    listedPrice: toNumber(row.listed_price),
    listedBy: row.listed_by,
    listedAt: toTime(row.listed_at),
    status: row.status,
    checkedPrice: toNumber(row.checked_price),
    checkedReference: toNumber(row.checked_reference),
    reviewedBy: row.reviewed_by,
    reviewedAt: toTime(row.reviewed_at),
    note: row.note,
  };
}

function packKey(packId, channel) {
  const id = String(packId ?? "").trim();
  if (!id || id.length > 100) throw badRequest("แพ็คไม่ถูกต้อง");
  if (!isGameinfoListingChannel(channel)) throw badRequest("ช่องทางขายไม่ถูกต้อง");
  return id;
}

export async function listGamelistPackListings(gameId, dataMode) {
  const pool = await getGameinfoPool();
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM gamelist_pack_listings WHERE game_id = $1 AND data_mode = $2 ORDER BY pack_id, channel`,
    [gameId, dataMode]
  );
  return result.rows.map(toListing);
}

/** Records where and at what price a pack is listed; no link and no price removes it. */
export async function saveGamelistPackListing(gameId, dataMode, { packId, channel, url = "", listedPrice = null }, actor) {
  const id = packKey(packId, channel);
  const link = String(url ?? "").trim().slice(0, 1000);
  if (!isGameinfoListingUrl(link)) throw badRequest("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
  const price = parseGameinfoListingPrice(listedPrice);
  if (Number.isNaN(price)) throw badRequest("ราคาที่ลงไม่ถูกต้อง");
  const pool = await getGameinfoPool();
  if (!link && price === null) {
    await pool.query(
      `DELETE FROM gamelist_pack_listings WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
      [gameId, dataMode, id, channel]
    );
  } else {
    await pool.query(
      `INSERT INTO gamelist_pack_listings (game_id, data_mode, pack_id, channel, url, listed_price, listed_by, listed_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'pending')
       ON CONFLICT (game_id, data_mode, pack_id, channel) DO UPDATE SET
         url = EXCLUDED.url, listed_price = EXCLUDED.listed_price, listed_by = EXCLUDED.listed_by,
         listed_at = NOW(), status = 'pending', checked_price = NULL, checked_reference = NULL, reviewed_by = '', reviewed_at = NULL, note = ''
       -- Saving the same link and price again changes nothing, the check included.
       WHERE gamelist_pack_listings.url IS DISTINCT FROM EXCLUDED.url
          OR gamelist_pack_listings.listed_price IS DISTINCT FROM EXCLUDED.listed_price`,
      [gameId, dataMode, id, channel, link, price, String(actor || "").slice(0, 120)]
    );
  }
  return listGamelistPackListings(gameId, dataMode);
}

/**
 * A check of a listed price: right ("ok") or wrong, with the price seen, a
 * note, and the pack's own price for that channel it was checked against
 * (`referencePrice`), so a later change to that price asks for a new check.
 */
export async function reviewGamelistPackListing(gameId, dataMode, { packId, channel, status, checkedPrice = null, referencePrice = null, note = "" }, actor) {
  const id = packKey(packId, channel);
  if (!GAMEINFO_LISTING_STATUSES.includes(status) || status === "pending") throw badRequest("ผลการตรวจไม่ถูกต้อง");
  const price = parseGameinfoListingPrice(checkedPrice);
  if (Number.isNaN(price)) throw badRequest("ราคาที่ตรวจไม่ถูกต้อง");
  const reference = parseGameinfoListingPrice(referencePrice);
  const reviewer = String(actor || "").slice(0, 120);
  const pool = await getGameinfoPool();
  const current = await pool.query(
    `SELECT listed_by FROM gamelist_pack_listings WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
    [gameId, dataMode, id, channel]
  );
  if (!current.rows.length) throw badRequest("ยังไม่มีการลงสินค้านี้ในช่องทางนั้น");
  if (current.rows[0].listed_by === reviewer) throw badRequest("ผู้ลงสินค้าตรวจเองไม่ได้ ต้องให้ admin คนอื่นตรวจ", 403);
  await pool.query(
    `UPDATE gamelist_pack_listings
       SET status = $5, checked_price = $6, checked_reference = $7, reviewed_by = $8, reviewed_at = NOW(), note = $9
     WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
    [gameId, dataMode, id, channel, status, price, Number.isNaN(reference) ? null : reference, reviewer, String(note ?? "").trim().slice(0, 500)]
  );
  return listGamelistPackListings(gameId, dataMode);
}
