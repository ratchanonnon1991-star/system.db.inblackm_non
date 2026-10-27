import { redirect } from "next/navigation";

export const metadata = { title: "GameDB — Game Bot Auto" };

export default async function GameinfoBotAutoPage({ params }) {
  const { lang } = await params;
  redirect(`/gameinfo/${lang}?section=game-bot-auto`);
}
