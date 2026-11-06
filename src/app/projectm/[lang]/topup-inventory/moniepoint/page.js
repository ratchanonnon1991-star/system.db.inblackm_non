import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import InventoryLedgerChannels from "@/components/inventory-ledger-channels";
import { ChannelReservations } from "@/components/inventory-reservations";

export const metadata = { title: "Moniepoint | Topup Inventory" };

// Moniepoint is filled by hand only: its accounts are the ANDROID NP / SLY sheets' Moniepoint tabs,
// and everything it spent is in the inventory ledger (imported sheets, debit page, order pages).
export default async function MoniepointPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  return <InventoryLedgerChannels lang={lang} channel="moniepoint" title="Moniepoint (NGN)"
    description="บัญชี Moniepoint NP และ SLY ยอดใช้ เติมเข้า และรายการของแต่ละบัญชี จากชีตที่นำเข้า หน้ายกยอด และหน้าออเดอร์ inblackm (หักรายการที่ยกเลิกแล้ว)">
    <ChannelReservations lang={lang} channel="moniepoint" />
  </InventoryLedgerChannels>;
}
