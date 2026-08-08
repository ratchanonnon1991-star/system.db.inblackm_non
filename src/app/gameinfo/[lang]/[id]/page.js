import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { getGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";
import {
  getGamelistPacks,
  listGamelistChannelsByGame,
  listGamelistVpnByGame,
} from "@/server/gameinfo-gamelist-packs";
import GameinfoGameView from "@/components/gameinfo-game-view";
import GameinfoErrorNotice from "@/components/gameinfo-error-notice";

export const metadata = {
  title: "GameDB — รายละเอียดเกม",
};

export default async function GameinfoGameDetailPage({ params }) {
  const { lang, id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  const editable = user.role === "admin" || user.role === "staff";

  // A non-numeric segment here (e.g. a stale /admin bookmark from before that
  // path was removed) would otherwise reach getGameListRow() as NaN and blow
  // up as a Postgres "invalid input syntax for type bigint" error instead of
  // a clean 404 — this route matches any [id], numeric or not.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let row;
  let currencies = [];
  let computedColumns = [];
  try {
    row = await getGameListRow(numericId);
    if (row) {
      const packs = await getGamelistPacks(row.id);
      currencies = packs.currencies;
      computedColumns = packs.computedColumns;
      const [vpnByGame, channelsByGame, allRows] = await Promise.all([
        listGamelistVpnByGame(),
        listGamelistChannelsByGame(),
        listGameListRows(),
      ]);
      // Same ordering the list table shows as "ลำดับ" (gamelist_order-aware,
      // falls back to id order) — this game's position within it.
      const orderPosition = allRows.findIndex((r) => r.id === row.id) + 1;
      row = {
        ...row,
        vpnComputed: vpnByGame[row.id] ? "YES" : "NO",
        channels: channelsByGame[row.id] || { main: [], secondary: [] },
        orderPosition: orderPosition > 0 ? orderPosition : null,
      };
    }
  } catch (err) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <GameinfoErrorNotice message={err.message || "โหลดข้อมูลไม่สำเร็จ"} />
      </div>
    );
  }
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/gameinfo/${lang}`}
          className="flex items-center gap-1 text-sm text-linear-primary hover:underline"
        >
          <ArrowLeft size={14} /> กลับหน้า GameInfo
        </Link>
        {editable && (
          <Link
            href={`/gameinfo/${lang}/${row.id}/packs`}
            className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-3 py-1.5 text-xs font-medium text-linear-primary hover:bg-linear-primary/10"
          >
            จัดการแพ็ก (สกุลเงิน/หมวดหมู่/สูตร) <ArrowRight size={14} />
          </Link>
        )}
      </div>
      <GameinfoGameView row={row} currencies={currencies} computedColumns={computedColumns} />
    </div>
  );
}
