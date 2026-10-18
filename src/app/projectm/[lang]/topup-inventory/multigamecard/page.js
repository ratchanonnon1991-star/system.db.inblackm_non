import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import MultigamecardInventory from "@/components/multigamecard-inventory";

export const metadata = { title: "Multigamecard | Topup Inventory" };
export default async function MultigamecardPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <MultigamecardInventory lang={lang} />;
}
