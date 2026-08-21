import { redirect } from "next/navigation";
import GameinfoHomePage from "@/components/gameinfo-home-page";
import { gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";

export const metadata = {
  title: "GameDB — GameInfo",
};

export default async function GameinfoHomeRoute(props) {
  const [{ lang }, query] = await Promise.all([props.params, props.searchParams]);
  const dataMode = normalizeGameinfoDataMode(query.mode);
  if (query.manage === "1") redirect(gameinfoListHref(lang, dataMode, true));
  return <GameinfoHomePage {...props} />;
}
