import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import UsdCodashopInventory from "@/components/usdcodashop-inventory";

export const metadata = { title: "USDCodashop | Topup Inventory" };
export default async function UsdCodashopPage({ params }) {
  const { lang } = await params; const actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <UsdCodashopInventory lang={lang} />;
}
