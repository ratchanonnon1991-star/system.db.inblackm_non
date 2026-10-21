import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import PlsbuyInventory from "@/components/plsbuy-inventory";
export const metadata = { title: "(MYR) Plsbuy | Topup Inventory" };
export default async function PlsbuyPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <PlsbuyInventory lang={lang} />;
}
