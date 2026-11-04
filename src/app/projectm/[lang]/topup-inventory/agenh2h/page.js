import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import Agenh2hInventory from "@/components/agenh2h-inventory";
export const metadata = { title: "(IDR) AgenH2H | Topup Inventory" };
export default async function Agenh2hPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <Agenh2hInventory lang={lang} />;
}
