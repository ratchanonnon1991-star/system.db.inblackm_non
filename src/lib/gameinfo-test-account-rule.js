// A game can only be on (เปิดใช้งาน) with this many test IDs. Fewer and it
// reads as ปิดใช้งาน everywhere, whatever its stored on/off switch says, and
// the status API refuses to turn it on. An account counts once its ID
// (login) is filled in; a name alone is not an ID to test with.
export const GAMEINFO_REQUIRED_TEST_IDS = 3;

export const GAMEINFO_TEST_IDS_HINT = `ใส่ ID ทดสอบ (TESTID) ให้ครบ ${GAMEINFO_REQUIRED_TEST_IDS} ID เกมถึงจะเปิดใช้งานได้ ถ้าไม่ครบ สถานะจะเป็นปิดใช้งาน`;

// Sent by the test-account editor whenever its list changes, so the status
// picker on the same page follows without a reload. detail: { gameId, count }.
export const GAMEINFO_TEST_IDS_EVENT = "gameinfo:test-ids";

export function gameinfoTestIdCount(accounts) {
  return (accounts || []).filter((account) => String(account?.login ?? "").trim()).length;
}

// null count = not known (failed to load): don't hold the game off for that.
export function gameinfoTestIdsShort(count) {
  if (count === null || count === undefined) return false;
  return (Number(count) || 0) < GAMEINFO_REQUIRED_TEST_IDS;
}

export function gameinfoTestIdsProgress(count) {
  return `มี ${Number(count) || 0}/${GAMEINFO_REQUIRED_TEST_IDS} ID`;
}
