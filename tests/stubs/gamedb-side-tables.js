// Stub for @/server/gamedb-side-tables.
export let allowWrite = true;
export function setAllowWrite(value) {
  allowWrite = value;
}
export async function getConnectionFlags() {
  return { allowWrite };
}
