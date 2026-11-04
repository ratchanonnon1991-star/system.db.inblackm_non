// Where a game's packs are listed for sale, one row per pack and channel, and
// whether each listed price was checked (src/lib/gameinfo-pack-listings.js).
// Each send for a check is a round: the lister names another admin as the
// checker, who has GAMEINFO_LISTING_REVIEW_MINUTES to answer; after that the
// round is closed and the lister sends a new one. Past rounds are kept.
import { getGameinfoPool } from "@/server/gameinfo-gamelist-packs";
import { listUsers } from "@/server/users-repository";
import { hasPermission } from "@/lib/permissions";
import {
  GAMEINFO_LISTING_REVIEW_MINUTES,
  GAMEINFO_LISTING_STATUSES,
  gameinfoListingActor,
  isGameinfoListingChannel,
  isGameinfoListingUrl,
  parseGameinfoListingPrice,
} from "@/lib/gameinfo-pack-listings";

const COLUMNS = `pack_id, channel, url, listed_price, listed_by, listed_at, status, checked_price, checked_reference,
  reviewed_by, reviewed_at, note, round, assigned_reviewer, send_note, history`;
const MAX_HISTORY = 20;

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
    round: Number(row.round) || 1,
    reviewer: row.assigned_reviewer || "",
    sendNote: row.send_note || "",
    history: Array.isArray(row.history) ? row.history : [],
  };
}

function packKey(packId, channel) {
  const id = String(packId ?? "").trim();
  if (!id || id.length > 100) throw badRequest("แพ็คไม่ถูกต้อง");
  if (!isGameinfoListingChannel(channel)) throw badRequest("ช่องทางขายไม่ถูกต้อง");
  return id;
}

/** The admins a listing can be sent to: who may check it. */
export async function listGameinfoListingReviewers() {
  const users = await listUsers();
  return users
    .filter((user) => hasPermission(user, "gameinfo.admin"))
    .map((user) => ({ username: gameinfoListingActor(user), name: user.displayName || user.username }));
}

export async function listGamelistPackListings(gameId, dataMode) {
  const pool = await getGameinfoPool();
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM gamelist_pack_listings WHERE game_id = $1 AND data_mode = $2 ORDER BY pack_id, channel`,
    [gameId, dataMode]
  );
  return result.rows.map(toListing);
}

// How a round ended, for the history: a pending round past its hour was never checked.
function closedRound(row, now = Date.now()) {
  const late = row.status === "pending" && new Date(row.listed_at).getTime() + GAMEINFO_LISTING_REVIEW_MINUTES * 60_000 < now;
  return {
    round: Number(row.round) || 1,
    status: late ? "late" : row.status,
    at: toTime(row.reviewed_at || row.listed_at),
    reviewer: row.reviewed_by || row.assigned_reviewer || "",
    lister: row.listed_by,
  };
}

/**
 * Sends a listing (its link and price) to `reviewer` for a check: the first
 * round, or the next one after a wrong price, a closed round or any change.
 * No link and no price removes the listing instead.
 */
export async function saveGamelistPackListing(gameId, dataMode, { packId, channel, url = "", listedPrice = null, reviewer = "", note = "" }, actor, reviewers = null) {
  const id = packKey(packId, channel);
  const link = String(url ?? "").trim().slice(0, 1000);
  if (!isGameinfoListingUrl(link)) throw badRequest("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
  const price = parseGameinfoListingPrice(listedPrice);
  if (Number.isNaN(price)) throw badRequest("ราคาที่ลงไม่ถูกต้อง");
  const lister = String(actor || "").slice(0, 120);
  const pool = await getGameinfoPool();
  if (!link && price === null) {
    await pool.query(
      `DELETE FROM gamelist_pack_listings WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
      [gameId, dataMode, id, channel]
    );
    return listGamelistPackListings(gameId, dataMode);
  }
  const checker = String(reviewer ?? "").trim().slice(0, 120);
  if (!checker) throw badRequest("เลือกผู้ตรวจก่อนส่งตรวจ");
  if (checker === lister) throw badRequest("ผู้ลงสินค้าตรวจเองไม่ได้ ต้องเลือก admin คนอื่น");
  const allowed = reviewers || await listGameinfoListingReviewers();
  if (!allowed.some((item) => item.username === checker)) throw badRequest("ผู้ตรวจต้องเป็น admin ของ GameInfo");
  const current = await pool.query(
    `SELECT status, listed_by, listed_at, reviewed_by, reviewed_at, round, assigned_reviewer, history
       FROM gamelist_pack_listings WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
    [gameId, dataMode, id, channel]
  );
  const previous = current.rows[0];
  const message = String(note ?? "").trim().slice(0, 500);
  if (previous && !message) throw badRequest("กรอกรายละเอียดที่แก้ไขก่อนส่งตรวจ");
  const history = previous ? [closedRound(previous), ...(Array.isArray(previous.history) ? previous.history : [])].slice(0, MAX_HISTORY) : [];
  await pool.query(
    `INSERT INTO gamelist_pack_listings
       (game_id, data_mode, pack_id, channel, url, listed_price, listed_by, listed_at, status, round, assigned_reviewer, send_note, history)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'pending', $8, $9, $10, $11)
     ON CONFLICT (game_id, data_mode, pack_id, channel) DO UPDATE SET
       url = EXCLUDED.url, listed_price = EXCLUDED.listed_price, listed_by = EXCLUDED.listed_by, listed_at = NOW(),
       status = 'pending', checked_price = NULL, checked_reference = NULL, reviewed_by = '', reviewed_at = NULL, note = '',
       round = EXCLUDED.round, assigned_reviewer = EXCLUDED.assigned_reviewer, send_note = EXCLUDED.send_note, history = EXCLUDED.history`,
    [gameId, dataMode, id, channel, link, price, lister, previous ? (Number(previous.round) || 1) + 1 : 1, checker, message || "ลงแพ็คใหม่", JSON.stringify(history)]
  );
  return listGamelistPackListings(gameId, dataMode);
}

/**
 * A check of a listed price, right ("ok") or wrong, by the admin it was sent
 * to and within the round's hour; it keeps the price seen, a note, and the
 * pack's own price it was checked against (`referencePrice`), so a later
 * change to that price asks for a new round.
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
    `SELECT listed_by, status, assigned_reviewer, listed_at > NOW() - make_interval(mins => $5) AS in_time
       FROM gamelist_pack_listings WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
    [gameId, dataMode, id, channel, GAMEINFO_LISTING_REVIEW_MINUTES]
  );
  const row = current.rows[0];
  if (!row) throw badRequest("ยังไม่มีการลงสินค้านี้ในช่องทางนั้น");
  if (row.listed_by === reviewer) throw badRequest("ผู้ลงสินค้าตรวจเองไม่ได้ ต้องให้ admin คนอื่นตรวจ", 403);
  if (row.assigned_reviewer && row.assigned_reviewer !== reviewer) throw badRequest("รอบนี้ส่งให้คนอื่นตรวจ", 403);
  if (row.status !== "pending") throw badRequest("รอบนี้ตรวจไปแล้ว ต้องให้ผู้ลงส่งตรวจรอบใหม่");
  if (!row.in_time) throw badRequest("หมดเวลาตรวจแล้ว ต้องให้ผู้ลงส่งตรวจรอบใหม่");
  await pool.query(
    `UPDATE gamelist_pack_listings
       SET status = $5, checked_price = $6, checked_reference = $7, reviewed_by = $8, reviewed_at = NOW(), note = $9
     WHERE game_id = $1 AND data_mode = $2 AND pack_id = $3 AND channel = $4`,
    [gameId, dataMode, id, channel, status, price, Number.isNaN(reference) ? null : reference, reviewer, String(note ?? "").trim().slice(0, 500)]
  );
  return listGamelistPackListings(gameId, dataMode);
}
