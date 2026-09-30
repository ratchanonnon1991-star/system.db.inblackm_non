import { recordEdit } from "@/server/gamedb-edit-log";
import { recalculateGameinfoPriceAlerts } from "@/server/gameinfo-market-system";

// Secondary work runs only after the authoritative write has committed.
// Its failure must not tell the caller that the saved data was rejected.
export async function runGameinfoPostSave(label, work) {
  try {
    await work();
    return true;
  } catch (error) {
    console.error(`[gameinfo-post-save] ${label} failed`, error);
    return false;
  }
}

export function recordGameinfoEditAfterSave(entry) {
  return runGameinfoPostSave(`edit log ${entry.table}/${entry.pkValue}`, () => recordEdit(entry));
}

export async function refreshGameinfoAlertsAfterSave(gameIds, dataMode) {
  for (const gameId of new Set(gameIds)) {
    await runGameinfoPostSave(`price alerts ${gameId}/${dataMode}`, async () => {
      const result = await recalculateGameinfoPriceAlerts({ gameId, dataMode });
      if (result.errors.length) throw new Error(JSON.stringify(result.errors));
    });
  }
}
