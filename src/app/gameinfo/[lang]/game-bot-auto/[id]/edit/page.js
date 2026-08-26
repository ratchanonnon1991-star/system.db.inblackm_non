import { notFound, redirect } from "next/navigation";
import GameinfoBotChannelForm from "@/components/gameinfo-bot-channel-form";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo } from "@/server/auth";
import { getGameinfoBotChannel } from "@/server/gameinfo-bot-channels";

export const metadata = { title: "GameDB — แก้ไขช่องทาง Game Bot Auto" };

export default async function EditGameinfoBotChannelPage({ params }) {
  const { lang, id } = await params;
  if (!canManageGameinfo(await getSessionUser())) redirect(`/gameinfo/${lang}/game-bot-auto`);
  const channel = await getGameinfoBotChannel(Number(id));
  if (!channel) notFound();
  return (
    <div className="px-4 py-8 sm:px-6">
      <div className="mx-auto mb-6 max-w-3xl">
        <p className="text-xs font-medium tracking-[0.4px] text-linear-ink-tertiary">GAME BOT AUTO</p>
        <h1 className="text-[28px] font-semibold tracking-[-0.6px] text-linear-ink">แก้ไข {channel.channelName}</h1>
      </div>
      <GameinfoBotChannelForm lang={lang} initial={channel} />
    </div>
  );
}
