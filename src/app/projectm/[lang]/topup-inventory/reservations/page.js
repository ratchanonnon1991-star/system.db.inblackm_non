import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import InventoryReservations from "@/components/inventory-reservations";

export const metadata = { title: "จองช่องทาง | Topup Inventory" };

// Every signed-in staff account may reserve, like the debit page.
export default async function ReservationsPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  return <InventoryReservations lang={lang} />;
}
