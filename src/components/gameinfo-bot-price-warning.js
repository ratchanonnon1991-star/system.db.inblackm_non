import { Bot } from "lucide-react";
import { isGameinfoBotAuto } from "@/lib/gameinfo-dashboard";

// A Bot Auto game is topped up by the bot from these prices, so a wrong price
// goes out without a person looking at it. Shown wherever prices are read or edited.
export default function GameinfoBotPriceWarning({ botManual, className }) {
  if (!isGameinfoBotAuto(botManual)) return null;
  return (
    <p role="note" className={className}>
      <Bot size={16} aria-hidden="true" className="shrink-0" />
      <span><b>เกมนี้เติมด้วย Bot Auto</b> ระวังการปรับแก้ราคา ตรวจให้ถูกก่อนบันทึกทุกครั้ง</span>
    </p>
  );
}
