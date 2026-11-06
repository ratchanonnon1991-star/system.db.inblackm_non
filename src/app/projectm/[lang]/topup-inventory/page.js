import TopupInventoryHome from "@/components/topup-inventory-home";

export const metadata = { title: "Topup Inventory" };

export default async function TopupInventoryPage({ params }) {
  const { lang } = await params;
  // The shared Projectm language layout validates language and login; the Topup Inventory layout loads the fonts.
  return <TopupInventoryHome lang={lang} />;
}
