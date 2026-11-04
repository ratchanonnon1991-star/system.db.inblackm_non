// Server-to-server bridge for the inblackm order pages (web orders, Russia, marketplace):
// the person working an order picks one of the accounts they reserved here and records how
// much it spent. Uses land in the inventory ledger like debit-page rows, as that person.
// Orders checks who owns the order (under its own lock) and says so in `order.canRecord`;
// this side checks the staff mapping and that the account is reserved by that person.
import { inventoryLedger } from "@/server/inventory-ledger";
import { resolveOrderActor } from "@/server/itune-order-usage";

export const ORDER_SOURCES = Object.freeze({
  web: "ออเดอร์เว็บ", russia: "Russia", kaleoz: "Kaleoz", itemku: "Itemku",
  playerok: "Playerok", playerok_topupman: "Playerok Topupman", g2g: "G2G",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function runChannelBridge(body, { ledger = inventoryLedger(), resolveActor = resolveOrderActor } = {}) {
  const actor = await resolveActor(body?.actorId);
  const source = text(body?.order?.source, 32), ref = text(body?.order?.ref, 120);
  if (!Object.hasOwn(ORDER_SOURCES, source) || !ref) fail("Invalid order");
  const canRecord = body.order.canRecord === true;
  const usage = () => ledger.orderUsage(actor, { orderRef: ref, orderSource: source });

  if (body.action === "list") return { held: canRecord ? await ledger.heldAccounts(actor) : [], usage: await usage() };

  const payload = body.payload ?? {};
  if (!UUID.test(String(payload.id ?? ""))) fail("Invalid operation ID");
  if (body.action === "use") {
    if (!canRecord) fail("ต้องรับงานออเดอร์นี้ก่อนบันทึกยอด", 403);
    // The note is built from request fields only, so a retry with the same id hashes the same.
    const result = await ledger.recordEntry({
      requestId: payload.id, kind: "use", accountId: payload.accountId, amount: payload.amount,
      orderRef: ref, orderSource: source, note: `${ORDER_SOURCES[source]} · บันทึกจากหน้าออเดอร์`,
    }, actor, { staff: true, holder: true });
    return { ...result, usage: await usage() };
  }
  if (body.action === "reverse") {
    // Only a use of this order; no reservation needed, so a released account can still be undone.
    if (!(await usage()).some((u) => u.id === String(payload.entryId) && !u.cancelled)) fail("ไม่พบรายการนี้ในออเดอร์", 404);
    const result = await ledger.reverseEntry({ requestId: payload.id, reversesEntryId: String(payload.entryId), note: "ยกเลิกจากหน้าออเดอร์" }, actor);
    return { ...result, usage: await usage() };
  }
  fail("Invalid action");
}
