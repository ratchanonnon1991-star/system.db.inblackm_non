import { redirect } from "next/navigation";
import GameinfoGameDetailPage from "@/components/gameinfo-game-detail-page";
import { gameinfoGameHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";

export const metadata = {
  title: "GameDB — รายละเอียดเกม",
};

export default async function GameinfoGameDetailRoute(props) {
  const [{ lang, id }, query] = await Promise.all([props.params, props.searchParams]);
  const dataMode = normalizeGameinfoDataMode(query.mode);
  if (query.manage === "1") redirect(gameinfoGameHref(lang, id, dataMode, true));
  return <GameinfoGameDetailPage {...props} />;
}
