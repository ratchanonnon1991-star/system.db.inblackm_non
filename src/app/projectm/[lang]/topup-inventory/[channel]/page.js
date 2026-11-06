import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { TOPUP_INVENTORY_PROVIDERS } from "@/lib/topup-inventory";
import InventoryLedgerChannels from "@/components/inventory-ledger-channels";
import { ChannelReservations } from "@/components/inventory-reservations";

// Every page made only of imported sheet accounts (U9, ATOM, GCash, Bitcash ...): its accounts to
// reserve, then what each spent. Pages with their own folder (Razer, Netease ...) never reach here.
const SHEET_PAGES = new Map(TOPUP_INVENTORY_PROVIDERS.filter((p) => p.sheet).map((p) => [p.key, p]));

export async function generateMetadata({ params }) {
  const page = SHEET_PAGES.get((await params).channel);
  return { title: `${page?.name ?? "Topup Inventory"} | Topup Inventory` };
}

// Every signed-in staff account may reserve, like the reservations and debit pages.
export default async function SheetChannelPage({ params }) {
  const { lang, channel } = await params, page = SHEET_PAGES.get(channel);
  if (!page) notFound();
  const actor = await getSessionUser();
  if (!actor) redirect("/");
  return <InventoryLedgerChannels lang={lang} channel={channel} title={page.name}
    description={`${page.description} · จองบัญชี ยอดใช้ เติมเข้า และรายการของแต่ละบัญชี จากชีตที่นำเข้า หน้ายกยอด และหน้าออเดอร์ inblackm`}>
    <ChannelReservations lang={lang} channel={channel} />
  </InventoryLedgerChannels>;
}
