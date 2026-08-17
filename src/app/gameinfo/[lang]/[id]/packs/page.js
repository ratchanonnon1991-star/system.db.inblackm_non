import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { getGameListRow } from "@/server/gameinfo-gamelist";
import { getGamelistPacks, listAllGamelistChannels } from "@/server/gameinfo-gamelist-packs";
import { buildPackSuggestions } from "@/lib/gameinfo-suggestions";
import GameinfoPackEditor from "@/components/gameinfo-pack-editor";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";
import GameinfoBackLink from "@/components/gameinfo-back-link";

export const metadata = {
  title: "GameDB — แพ็กเกม",
};

export default async function GameinfoGamelistPacksPage({ params }) {
  const { lang, id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role === "user") redirect(`/gameinfo/${lang}`);

  // A non-numeric [id] segment would otherwise reach getGameListRow() as NaN
  // and blow up as a Postgres "invalid input syntax for type bigint" error
  // instead of a clean 404 — see the same guard on the [id] detail page.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let row;
  let packs;
  let allChannels = [];
  try {
    row = await getGameListRow(numericId);
    if (row) {
      [packs, allChannels] = await Promise.all([getGamelistPacks(row.id), listAllGamelistChannels()]);
    }
  } catch (err) {
    return (
      <div className="px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!row) notFound();

  const game = {
    id: row.id,
    gameName: row.game,
    region: row.region,
    platform: row.platform,
    server: row.server,
    currencies: packs.currencies,
    computedColumns: packs.computedColumns,
    costProfiles: packs.costProfiles,
  };

  return (
    <div className="px-4 py-8 pb-24">
      <GameinfoBackLink
        className="mb-4 inline-flex items-center gap-1 text-sm text-linear-primary hover:underline"
        fallbackHref={`/gameinfo/${lang}/${row.id}`}
      />
      <h1 className="mb-6 text-2xl font-bold text-linear-ink">แพ็ก — {row.game}</h1>
      <GameinfoPackEditor
        game={game}
        lang={lang}
        userId={user.id}
        // channels: shared across every game (not just this one's own packs)
        // so a channel typed once while editing any game is immediately
        // offered again while editing any other — see
        // listAllGamelistChannels(). Currency/category/country suggestions
        // stay scoped to this game only.
        suggestions={{ ...buildPackSuggestions(game), channels: allChannels }}
        savePacksUrl={`/api/gameinfo/gamelist/${row.id}/packs`}
        importPreviewUrl={`/api/gameinfo/import/preview?gameId=${row.id}`}
        exportUrl={`/api/gameinfo/import/export?gameId=${row.id}`}
      />
    </div>
  );
}
