import { redirect } from "next/navigation";
import { topupInventoryPath } from "@/lib/topup-inventory";

export default async function ProjectmLangPage({ params }) {
  const { lang } = await params;
  redirect(topupInventoryPath(lang));
}
