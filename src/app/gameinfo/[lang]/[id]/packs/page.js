import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo } from "@/server/auth";
import { getGameListRow } from "@/server/gameinfo-gamelist";
import {
  getGamelistPacks,
  listAllGamelistChannels,
  listGamelistPackLanguages,
} from "@/server/gameinfo-gamelist-packs";
import { buildPackSuggestions } from "@/lib/gameinfo-suggestions";
import GameinfoPackEditor from "@/components/gameinfo-pack-editor";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";
import GameinfoBackLink from "@/components/gameinfo-back-link";
import { getGameinfoFormulaVariables } from "@/server/gameinfo-formula-variables";
import { gameinfoGameHref, gameinfoListHref, gameinfoPacksHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData } from "@/server/gameinfo-mode-data";
import GameinfoDatasetToggle from "@/components/gameinfo-dataset-toggle";
import GameinfoModeCloneButton from "@/components/gameinfo-mode-clone-button";

export const metadata = {
  title: "GameDB — แพ็กเกม",
};

export default async function GameinfoGamelistPacksPage({ params, searchParams }) {
  const { lang, id } = await params;
  const { mode: rawMode } = await searchParams;
  const dataMode = normalizeGameinfoDataMode(rawMode);
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!canManageGameinfo(user)) redirect(gameinfoListHref(lang, dataMode));

  // A non-numeric [id] segment would otherwise reach getGameListRow() as NaN
  // and blow up as a Postgres "invalid input syntax for type bigint" error
  // instead of a clean 404 — see the same guard on the [id] detail page.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let row;
  let packs;
  let allChannels = [];
  let formulaVariables = [];
  let packLanguages = [];
  let modeFields = null;
  let modeVersion = null;
  try {
    row = await getGameListRow(numericId);
    if (row) {
      const [modeData, channels, variableData, languages] = await Promise.all([
        dataMode === "idpass" ? getGameinfoModeData(row.id, dataMode) : null,
        listAllGamelistChannels(),
        getGameinfoFormulaVariables(row.id),
        listGamelistPackLanguages(),
      ]);
      packs = modeData?.packs || await getGamelistPacks(row.id);
      modeFields = modeData?.fields || null;
      modeVersion = modeData?.version || null;
      allChannels = channels;
      formulaVariables = variableData.variables;
      packLanguages = languages;
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
    region: modeFields?.region ?? row.region,
    platform: modeFields?.platform ?? row.platform,
    server: modeFields?.server ?? row.server,
    currencies: packs.currencies,
    computedColumns: packs.computedColumns,
    costProfiles: packs.costProfiles,
    formulaVariables,
    packLanguages,
    version: dataMode === "idpass" ? modeVersion : packs.version,
  };

  return (
    <div className="px-4 py-8 pb-24">
      <GameinfoBackLink
        className="mb-4 inline-flex items-center gap-1 text-sm text-linear-primary hover:underline"
        href={gameinfoGameHref(lang, row.id, dataMode)}
      />
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="min-w-0 break-words text-2xl font-bold text-linear-ink">แพ็ก — {row.game}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <GameinfoModeCloneButton gameId={row.id} currentMode={dataMode} scope="packs" />
          <GameinfoDatasetToggle basePath={gameinfoPacksHref(lang, row.id, "uid")} />
        </div>
      </div>
      <GameinfoPackEditor
        key={dataMode}
        game={game}
        userId={user.id}
        // channels: shared across every game (not just this one's own packs)
        // so a channel typed once while editing any game is immediately
        // offered again while editing any other — see
        // listAllGamelistChannels(). Currency/category/country suggestions
        // stay scoped to this game only.
        suggestions={{ ...buildPackSuggestions(game), channels: allChannels }}
        dataMode={dataMode}
        backHref={gameinfoGameHref(lang, row.id, dataMode)}
        historyUrl={`/api/gameinfo/gamelist/${row.id}/packs/history?limit=200${dataMode === "idpass" ? "&mode=idpass" : ""}`}
        savePacksUrl={`/api/gameinfo/gamelist/${row.id}/packs${dataMode === "idpass" ? "?mode=idpass" : ""}`}
        importPreviewUrl={`/api/gameinfo/import/preview?gameId=${row.id}`}
        exportUrl={`/api/gameinfo/import/export?gameId=${row.id}${dataMode === "idpass" ? "&mode=idpass" : ""}`}
      />
    </div>
  );
}
