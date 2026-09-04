import { russiaCheckRecentBounds } from "@/lib/gameinfo-russia-check-recency";

export async function getRussiaCheckDailyLog(pool, gameId = null, now = new Date()) {
  const bounds = russiaCheckRecentBounds(now);
  const { rows } = await pool.query(
    `SELECT s.game_id,MIN(s.expected_game_name) AS game_name,
            BOOL_OR(EXISTS (
              SELECT 1 FROM gameinfo_russia_check_events e
              WHERE e.source_id=s.id AND e.created_at > $2::timestamptz AND e.created_at <= $3::timestamptz
                AND e.event_type IN ('added','removed','restored')
            )) AS has_changes,
            BOOL_AND(EXISTS (
              SELECT 1 FROM gameinfo_russia_check_run_sources rs
              WHERE rs.source_id=s.id AND rs.status='completed'
                AND rs.finished_at > $2::timestamptz AND rs.finished_at <= $3::timestamptz
            )) AS checked_recently
     FROM gameinfo_russia_check_sources s
     WHERE (s.enabled OR s.provider='demo' OR s.auth_required)
       AND ($1::int IS NULL OR s.game_id=$1)
     GROUP BY s.game_id
     ORDER BY game_name,s.game_id`,
    [gameId, bounds.startAt, bounds.endAt]
  );
  return {
    ...bounds,
    games: rows.map((row) => ({
      gameId: Number(row.game_id),
      gameName: row.game_name,
      status: row.has_changes ? "changed" : row.checked_recently ? "unchanged" : "unchecked",
    })),
  };
}
