import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import InventoryLedgerChannels from "@/components/inventory-ledger-channels";

export const metadata = { title: "ยอดเติมมือรายบัญชี | Topup Inventory" };

// Every signed-in account may read it, like the debit page it summarises.
export default async function LedgerChannelsPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  return <InventoryLedgerChannels lang={lang} />;
}
