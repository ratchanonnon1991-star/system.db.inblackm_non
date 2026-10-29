import { requireAdmin } from "@/server/auth";
import { jsonOk } from "@/lib/http";
import { ledgerError } from "@/lib/inventory-ledger";
import { inventoryLedger } from "@/server/inventory-ledger";
import { orderLookup, LOOKUP_MAX_REFS } from "@/server/inventory-order-lookup";
import { ledgerFailure, readLedgerJson } from "@/server/inventory-ledger-http";

export const dynamic = "force-dynamic";

// POST { refs: ["K123", "#307174", ...] } -> where each order is, and whether it was already debited.
export async function POST(request) {
  try {
    const actor = await requireAdmin(request), body = await readLedgerJson(request, 32768);
    if (!Array.isArray(body?.refs)) throw ledgerError("ต้องส่งรายการเลขออเดอร์");
    if (body.refs.length > LOOKUP_MAX_REFS) throw ledgerError(`ค้นได้ครั้งละไม่เกิน ${LOOKUP_MAX_REFS} เลข`);
    const refs = body.refs.map(r => String(r ?? "").trim()).filter(Boolean);
    const [orders, recorded] = await Promise.all([orderLookup().lookup(refs), inventoryLedger().debitedOrderRefs(actor, refs)]);
    for (const ref of Object.keys(orders)) orders[ref].alreadyDebited = recorded.has(ref);
    const response = jsonOk({ orders });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) { return ledgerFailure(e, "lookup"); }
}
