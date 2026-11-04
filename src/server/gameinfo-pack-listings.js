// Where a game's packs are listed for sale, one row per pack and channel, and
// whether each listed price was checked (src/lib/gameinfo-pack-listings.js).
// Saving a listing sends it back to "pending": a changed price needs a new check.
import { getGameinfoPool } from "@/server/gameinfo-gamelist-packs";
import {
  GAMEINFO_LISTING_STATUSES,
  isGameinfoListingChannel,
  isGameinfoListingUrl,
  parseGameinfoListingPrice,
} from "@/lib/gameinfo-pack-listings";

const COLUMNS = "pack_id, channel, url, listed_price, listed_by, listed_at, status, checked_price, reviewed_by, reviewed_at, note";

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
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
         listed_at = NOW(), status = 'pending', checked_price = NULL, reviewed_by = '', reviewed_at = NULL, note = ''`,
      [gameId, dataMode, id, channel, link, price, String(actor || "").slice(0, 120)]
    );
  }
  return listGamelistPackListings(gameId, dataMode);
}

/** A check of a listed price: right ("ok") or wrong, with the price seen and a note. */
export async function reviewGamelistPackListing(gameId, dataMode, { packId, channel, status, checkedPrice = null, note = "" }, actor) {
  const id = packKey(packId, channel);
  if (!GAMEINFO_LISTING_STATUSES.includes(status) || status === "pending") throw badRequest("ผลการตรวจไม่ถูกต้อง");
  const price = parseGameinfoListingPrice(checkedPrice);
  if (Number.isNaN(price)) throw badRequest("ราคาที่ตรวจไม่ถูกต้อง");
  const pool = await getGameinfoPool();
  const result = await pool.query(
    `UPDATE gamelist_pack_listings
       SET status = $5, checked_price = $6, reviewed_by = $7, reviewed_at = NOW(), note = $8
     WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
    [gameId, dataMode, id, channel, status, price, String(actor || "").slice(0, 120), String(note ?? "").trim().slice(0, 500)]
  );
  if (!result.rowCount) throw badRequest("ยังไม่มีการลงสินค้านี้ในช่องทางนั้น");
  return listGamelistPackListings(gameId, dataMode);
}
