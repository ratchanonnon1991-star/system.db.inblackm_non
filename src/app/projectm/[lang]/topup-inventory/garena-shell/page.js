import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import GarenaShellInventory from "@/components/garena-shell-inventory";

export const metadata = { title: "Garena Shell | Topup Inventory" };
export default async function GarenaShellPage({ params }) {
  const { lang } = await params;
  const actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <GarenaShellInventory lang={lang} />;
}
