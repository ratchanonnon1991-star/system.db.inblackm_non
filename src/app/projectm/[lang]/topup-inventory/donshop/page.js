import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import DonshopInventory from "@/components/donshop-inventory";
export const metadata = { title: "(IDR) Donshop | Topup Inventory" };
export default async function DonshopPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <DonshopInventory lang={lang} />;
}
