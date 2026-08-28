import Link from "next/link";
import { Bot, ChevronRight, CloudCog, Image as ImageIcon, Plus } from "lucide-react";
import GameinfoBotEditLink from "./gameinfo-bot-edit-link";

export default function GameinfoBotCatalog({ channels, categoryImages, editable, lang }) {
  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.4px] text-linear-ink-tertiary">GAMEINFO</p>
          <h1 className="text-[28px] font-semibold tracking-[-0.6px] text-linear-ink">Game Bot Auto</h1>
          <p className="mt-1 text-sm text-linear-ink-subtle">ช่องทาง สกุลเงิน และรายชื่อเกมสำหรับระบบ BOT และ API</p>
        </div>
        {editable ? (
          <Link href={`/gameinfo/${lang}/game-bot-auto/new`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-linear-ink px-4 text-sm font-medium text-linear-canvas">
            <Plus size={16} /> เพิ่มช่องทาง
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {["BOT", "API"].map((category) => {
          const items = channels.filter((channel) => channel.category === category);
          const CategoryIcon = category === "BOT" ? Bot : CloudCog;
          return (
            <section key={category} className="rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3 border-b border-linear-hairline pb-4">
                {categoryImages[category] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={categoryImages[category]} alt="" className="h-14 w-14 shrink-0 object-contain" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-linear-surface-3 text-linear-ink"><CategoryIcon size={25} /></span>
                )}
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.2px] text-linear-ink">{category}</h2>
                  <p className="text-xs text-linear-ink-tertiary">{items.length} ช่องทาง</p>
                </div>
              </div>

              <div className="space-y-4">
                {items.map((channel) => (
                  <details key={channel.id} className="group overflow-hidden rounded-xl border border-l-2 border-linear-hairline border-l-linear-primary bg-linear-surface-1">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-linear-surface-2 [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 items-center gap-3">
                        {channel.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={channel.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-surface-3 text-linear-ink-tertiary"><ImageIcon size={17} /></span>
                        )}
                        <h3 className="truncate font-semibold text-linear-primary">{channel.channelName}</h3>
                        {editable ? <GameinfoBotEditLink href={`/gameinfo/${lang}/game-bot-auto/${channel.id}/edit`} channelName={channel.channelName} /> : null}
                      </span>
                      <ChevronRight size={19} className="shrink-0 text-linear-primary transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="space-y-4 border-t border-linear-hairline px-4 py-4">
                      {channel.currencies.map((currency, currencyIndex) => (
                        <div key={`${currency.name}-${currencyIndex}`}>
                          <p className="text-base font-semibold text-linear-primary">สกุลเงิน: {currency.name || "ไม่ระบุ"}</p>
                          <ul className="mt-2 list-disc space-y-1.5 pl-8 text-sm text-linear-ink-subtle marker:text-linear-ink-tertiary">
                            {currency.games.map((game) => <li key={game}>{game}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
                {!items.length ? <p className="py-6 text-center text-sm text-linear-ink-tertiary">ยังไม่มีช่องทาง</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
