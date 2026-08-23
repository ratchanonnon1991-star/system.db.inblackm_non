import GameinfoHomePage from "@/components/gameinfo-home-page";

export const metadata = {
  title: "GameDB — จัดการ GameInfo",
};

export default function GameinfoManageRoute(props) {
  return <GameinfoHomePage {...props} manage />;
}
