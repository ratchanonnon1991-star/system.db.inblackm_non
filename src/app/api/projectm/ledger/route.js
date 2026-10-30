import { requireAdmin } from "@/server/auth";
import { jsonOk } from "@/lib/http";
import { ledgerError } from "@/lib/inventory-ledger";
import { inventoryLedger } from "@/server/inventory-ledger";
import { bangkokDayBounds, ledgerFailure, readLedgerJson } from "@/server/inventory-ledger-http";

export const dynamic = "force-dynamic";

// GET ?view=accounts | ?view=entries&from=YYYY-MM-DD&to=YYYY-MM-DD[&accountId=][&mine=1] | ?view=summary&from=&to=
// Every signed-in staff account may read and debit (decided 2026-10-29).
export async function GET(request) {
  try {
    const actor = await requireAdmin(request), p = new URL(request.url).searchParams, view = p.get("view") || "accounts";
    let body;
    if (view === "accounts") body = { accounts: await inventoryLedger().debitAccounts(actor) };
    else {
      const from = bangkokDayBounds(p.get("from")), to = bangkokDayBounds(p.get("to") || p.get("from"));
      if (Date.parse(to.end) - Date.parse(from.start) > 93 * 86400000) throw ledgerError("เลือกช่วงวันที่ได้ไม่เกิน 93 วัน");
      const range = { from: from.start, to: to.end };
      if (view === "entries") body = await inventoryLedger().listEntries(actor, { ...range, accountId: p.get("accountId") || "", mine: p.get("mine") === "1" });
      else if (view === "summary") body = { accounts: await inventoryLedger().debitSummary(actor, range) };
      else throw ledgerError("ไม่รู้จักมุมมองนี้");
    }
    const response = jsonOk(body);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) { return ledgerFailure(e, "read"); }
}

// POST { action: "debit", accountId, rows: [{ requestId, orderRef, amount, invoice? }] }
//      { action: "reverse", requestId, reversesEntryId }
export async function POST(request) {
  try {
    const actor = await requireAdmin(request), body = await readLedgerJson(request);
    if (body?.action === "debit") return jsonOk(await inventoryLedger().recordDebits(body, actor), 201);
    if (body?.action === "reverse") return jsonOk(await inventoryLedger().reverseEntry(body, actor), 201);
    throw ledgerError("ไม่รู้จักคำสั่งนี้");
  } catch (e) { return ledgerFailure(e, "write"); }
}
