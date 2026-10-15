import { redirect } from "next/navigation";
import { topupInventoryPath } from "@/lib/topup-inventory";

export default async function LegacyItuneLanding({ params }) {
  const { lang } = await params;
  redirect(topupInventoryPath(lang));
}
