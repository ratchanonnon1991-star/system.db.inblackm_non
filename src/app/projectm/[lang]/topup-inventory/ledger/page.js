import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import InventoryLedgerDebit from "@/components/inventory-ledger-debit";

export const metadata = { title: "ยกยอด | Topup Inventory" };

// Not linked from the Topup Inventory home yet: open by URL while it is tried out.
// Every signed-in account may debit (decided 2026-10-29); roles come later.
export default async function LedgerDebitPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  return <InventoryLedgerDebit lang={lang} />;
}
