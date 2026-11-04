import { requireAdmin } from "@/server/auth";
import { jsonOk } from "@/lib/http";
import { canManageUsdInventory } from "@/lib/usdcodashop-inventory";
import { inventoryLedger } from "@/server/inventory-ledger";
import { orderMappingFor } from "@/server/itune-order-usage";
import { ledgerFailure, readLedgerJson } from "@/server/inventory-ledger-http";

export const dynamic = "force-dynamic";

// GET: every account and who holds it. POST { accountId }: reserve. DELETE { accountId }: release.
export async function GET(request) {
  try {
    const actor = await requireAdmin(request);
    const [accounts, mapping] = await Promise.all([inventoryLedger().reservations(actor), orderMappingFor(actor.id).catch(() => null)]);
    const response = jsonOk({ accounts, mapped: Boolean(mapping), canManage: canManageUsdInventory(actor) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) { return ledgerFailure(e, "reservations"); }
}

export async function POST(request) {
  try {
    const actor = await requireAdmin(request), body = await readLedgerJson(request, 1024);
    return jsonOk(await inventoryLedger().reserve(body?.accountId, actor));
  } catch (e) { return ledgerFailure(e, "reserve"); }
}

export async function DELETE(request) {
  try {
    const actor = await requireAdmin(request), body = await readLedgerJson(request, 1024);
    return jsonOk(await inventoryLedger().release(body?.accountId, actor));
  } catch (e) { return ledgerFailure(e, "release"); }
}
