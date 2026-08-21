import GameinfoGameDetailPage from "@/components/gameinfo-game-detail-page";

export const metadata = {
  title: "GameDB — จัดการเกม",
};

export default function GameinfoGameManageRoute(props) {
  return <GameinfoGameDetailPage {...props} manage />;
}
