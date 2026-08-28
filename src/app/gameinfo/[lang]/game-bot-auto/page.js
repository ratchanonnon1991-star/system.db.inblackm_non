import { redirect } from "next/navigation";

export const metadata = { title: "GameDB — Game Bot Auto" };

export default async function GameinfoBotAutoPage({ params, searchParams }) {
  const [{ lang }, query] = await Promise.all([params, searchParams]);
  redirect(`/gameinfo/${lang}?section=game-bot-auto${query.view === "topup" ? "&view=topup" : ""}`);
}
