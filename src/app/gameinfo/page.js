import { redirect } from "next/navigation";
import { DEFAULT_LANG } from "@/lib/gameinfo-i18n";

export default function GameinfoRootPage() {
  redirect(`/gameinfo/${DEFAULT_LANG}`);
}
