import { Noto_Sans_Thai, Sora } from "next/font/google";
import TopupInventoryHome from "@/components/topup-inventory-home";

export const metadata = { title: "Topup Inventory" };

// The home's design pairs Sora (headings, numbers) with Noto Sans Thai (text).
const display = Sora({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--tiv-font-display" });
const body = Noto_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], variable: "--tiv-font-body" });

export default async function TopupInventoryPage({ params }) {
  const { lang } = await params;
  // The shared Projectm language layout validates language and login.
  return <TopupInventoryHome lang={lang} fontClassName={`${display.variable} ${body.variable}`} />;
}
