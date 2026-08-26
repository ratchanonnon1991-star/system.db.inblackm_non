import { redirect } from "next/navigation";
import GameinfoBotChannelForm from "@/components/gameinfo-bot-channel-form";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo } from "@/server/auth";

export const metadata = { title: "GameDB — เพิ่มช่องทาง Game Bot Auto" };

export default async function NewGameinfoBotChannelPage({ params }) {
  const { lang } = await params;
  if (!canManageGameinfo(await getSessionUser())) redirect(`/gameinfo/${lang}/game-bot-auto`);
  return (
    <div className="px-4 py-8 sm:px-6">
      <div className="mx-auto mb-6 max-w-3xl">
        <p className="text-xs font-medium tracking-[0.4px] text-linear-ink-tertiary">GAME BOT AUTO</p>
        <h1 className="text-[28px] font-semibold tracking-[-0.6px] text-linear-ink">เพิ่มช่องทาง</h1>
      </div>
      <GameinfoBotChannelForm lang={lang} />
    </div>
  );
}
