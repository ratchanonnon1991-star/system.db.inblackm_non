import { Noto_Sans_Thai, Sora } from "next/font/google";
import TopupInventoryShell from "@/components/topup-inventory-shell";
import "./topup-inventory-fonts.css";

// The Topup Inventory design pairs Sora (headings, numbers) with Noto Sans Thai
// (text) on the home and on every service page under it.
const display = Sora({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--tiv-font-display" });
const body = Noto_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], variable: "--tiv-font-body" });

export default async function TopupInventoryLayout({ children, params }) {
  const { lang } = await params;
  return <div className={`tiv-fonts ${display.variable} ${body.variable}`}><TopupInventoryShell lang={lang}>{children}</TopupInventoryShell></div>;
}
