import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { getGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";
import {
  getGamelistPacks,
  listGamelistChannelsByGame,
  listGamelistVpnByGame,
} from "@/server/gameinfo-gamelist-packs";
import { getGamelistTutorial, getGamelistWarning } from "@/server/gameinfo-gamelist-tutorial";
import { getGamelistImage } from "@/server/gameinfo-gamelist-image";
import { getGamelistLinks, legacyGamelistLinks } from "@/server/gameinfo-gamelist-links";
import { getGameinfoFormulaVariables } from "@/server/gameinfo-formula-variables";
import GameinfoGameView from "@/components/gameinfo-game-view";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";
import GameinfoBackLink from "@/components/gameinfo-back-link";
import GameinfoDatasetToggle from "@/components/gameinfo-dataset-toggle";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData } from "@/server/gameinfo-mode-data";
import GameinfoModeCloneButton from "@/components/gameinfo-mode-clone-button";
import GameinfoGameManager from "@/components/gameinfo-game-manager";

export const metadata = {
  title: "GameDB — รายละเอียดเกม",
};

export default async function GameinfoGameDetailPage({ params, searchParams }) {
  const { lang, id } = await params;
  const { mode: rawMode, manage } = await searchParams;
  const dataMode = normalizeGameinfoDataMode(rawMode);
  const user = await getSessionUser();
  if (!user) redirect("/");
  const editableRole = user.role === "admin" || user.role === "staff";
  const manageMode = editableRole && manage === "1";

  // A non-numeric segment here (e.g. a stale /admin bookmark from before that
  // path was removed) would otherwise reach getGameListRow() as NaN and blow
  // up as a Postgres "invalid input syntax for type bigint" error instead of
  // a clean 404 — this route matches any [id], numeric or not.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let row;
  let currencies = [];
  let computedColumns = [];
  let costProfiles = [];
  let formulaVariables = [];
  let existingNames = [];
  try {
    row = await getGameListRow(numericId);
    if (row) {
      const modeData = dataMode === "idpass" ? await getGameinfoModeData(row.id, dataMode) : null;
      const packs = modeData?.packs || await getGamelistPacks(row.id);
      currencies = packs.currencies;
      computedColumns = packs.computedColumns;
      costProfiles = packs.costProfiles;
      const packDisabledCount = currencies.reduce(
        (total, currency) => total + currency.categories.reduce(
          (categoryTotal, category) => categoryTotal + category.packs.filter((pack) => pack.serviceEnabled === false).length,
          0
        ),
        0
      );
      const flatModePacks = currencies.flatMap((currency) =>
        currency.categories.flatMap((category) => category.packs)
      );
      const modeChannels = {
        main: [...new Set(flatModePacks.flatMap((pack) => pack.channelsMain || []))],
        secondary: [...new Set(flatModePacks.flatMap((pack) => pack.channelsSecondary || []))],
      };
      const [vpnByGame, channelsByGame, allRows, tutorial, warning, image, storedLinks, variableData] = await Promise.all([
        listGamelistVpnByGame(),
        listGamelistChannelsByGame(),
        listGameListRows(),
        dataMode === "idpass" ? Promise.resolve(modeData.tutorial) : getGamelistTutorial(row.id),
        dataMode === "idpass" ? Promise.resolve(modeData.warning) : getGamelistWarning(row.id),
        getGamelistImage(row.id),
        dataMode === "idpass" ? Promise.resolve({ exists: true, links: modeData.links }) : getGamelistLinks(row.id),
        getGameinfoFormulaVariables(row.id),
      ]);
      // Same ordering the list table shows as "ลำดับ" (gamelist_order-aware,
      // falls back to id order) — this game's position within it.
      const orderPosition = allRows.findIndex((r) => r.id === row.id) + 1;
      existingNames = allRows.filter((item) => item.id !== row.id).map((item) => item.game);
      row = {
        ...row,
        ...(modeData?.fields || {}),
        vpnComputed: dataMode === "idpass" ? (flatModePacks.some((pack) => pack.country) ? "YES" : "NO") : vpnByGame[row.id] ? "YES" : "NO",
        channels: dataMode === "idpass" ? modeChannels : channelsByGame[row.id] || { main: [], secondary: [] },
        orderPosition: orderPosition > 0 ? orderPosition : null,
        hasTutorial: tutorial.categories.some((c) => c.steps.length > 0),
        hasWarning: warning.categories.some((c) => c.steps.length > 0),
        image: image.imageUrl,
        links: storedLinks.exists ? storedLinks.links : legacyGamelistLinks(row.link),
        packDisabledCount,
        serviceStatus: row.serviceNew ? "new" : !row.serviceEnabled ? "offline" : packDisabledCount > 0 ? "partial" : "online",
      };
      formulaVariables = variableData.variables;
    }
  } catch (err) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!row) notFound();

  const viewParams = new URLSearchParams();
  if (dataMode === "idpass") viewParams.set("mode", "idpass");
  const viewHref = `/gameinfo/${lang}/${row.id}${viewParams.size ? `?${viewParams}` : ""}`;
  viewParams.set("manage", "1");
  const manageHref = `/gameinfo/${lang}/${row.id}?${viewParams}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <GameinfoBackLink
          className="flex items-center gap-1 text-sm text-linear-primary hover:underline"
          fallbackHref={`/gameinfo/${lang}${dataMode === "idpass" ? "?mode=idpass" : ""}`}
        />
        <div className="flex items-center gap-2">
          {editableRole ? (
            <Link href={manageMode ? viewHref : manageHref} className="rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2">
              {manageMode ? "ดูหน้าผู้ใช้" : "จัดการเกม"}
            </Link>
          ) : null}
          {manageMode ? <GameinfoModeCloneButton gameId={row.id} currentMode={dataMode} /> : null}
          <GameinfoDatasetToggle basePath={`/gameinfo/${lang}/${row.id}`} />
        {manageMode && (
          <Link
            href={`/gameinfo/${lang}/${row.id}/packs${dataMode === "idpass" ? "?mode=idpass" : ""}`}
            className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-3 py-1.5 text-xs font-medium text-linear-primary hover:bg-linear-primary/10"
          >
            จัดการแพ็ก (สกุลเงิน/หมวดหมู่/สูตร) <ArrowRight size={14} />
          </Link>
        )}
        </div>
      </div>
      {manageMode ? <GameinfoGameManager row={row} existingNames={existingNames} dataMode={dataMode} /> : null}
      {manageMode ? <h2 className="mb-3 text-sm font-semibold text-linear-ink-muted">ตัวอย่างหน้าผู้ใช้</h2> : null}
      <GameinfoGameView
        key={dataMode}
        row={row}
        currencies={currencies}
        computedColumns={computedColumns}
        costProfiles={costProfiles}
        formulaVariables={formulaVariables}
        userId={user.id}
        dataMode={dataMode}
      />
    </div>
  );
}
