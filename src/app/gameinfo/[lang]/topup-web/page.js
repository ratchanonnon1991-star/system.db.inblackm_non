import { redirect } from "next/navigation";
import { canManageGameinfo } from "@/server/auth";
import { getSessionUser } from "@/server/session-user";
import { listGameListRows } from "@/server/gameinfo-gamelist";
import { listGamelistGameSettings } from "@/server/gameinfo-game-settings";
import { listTopupWebGames } from "@/server/gameinfo-topup-web";
import GameinfoTopupWebLinker from "@/components/gameinfo-topup-web-linker";
import GameinfoBackLink from "@/components/gameinfo-back-link";

export const metadata = { title: "GameInfo — เชื่อมเกมกับเว็บ TopUp" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  // Linking and creating games are edits, so this is an admin page.
  if (!canManageGameinfo(user)) redirect(`/gameinfo/${lang}`);

  const [rows, settings, webGames] = await Promise.all([
    listGameListRows(),
    listGamelistGameSettings(),
    listTopupWebGames(),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-7">
      <GameinfoBackLink
        className="mb-5 flex h-10 w-fit items-center gap-1.5 rounded-full border border-linear-hairline bg-linear-surface-1 px-4 text-[13px] font-bold text-linear-ink transition hover:bg-linear-surface-2"
        href={`/gameinfo/${lang}`}
      />
      <h1 className="text-[28px] font-black text-linear-ink">เชื่อมเกมกับเว็บ TopUp</h1>
      <p className="mb-5 max-w-3xl text-sm text-linear-ink-muted">
        จับคู่เกมใน GameInfo กับเกมบนเว็บทีละหลายเกม แล้วนำเข้าเกมที่เว็บมีแต่ GameInfo ยังไม่มี
        ข้อมูลไหลทางเดียวจากเว็บเข้ามา ไม่เขียนกลับไปที่เว็บ
      </p>
      {webGames ? (
        <GameinfoTopupWebLinker
          lang={lang}
          games={rows.map((row) => ({ id: row.id, game: row.game, region: row.region, topupGameId: settings[row.id]?.topupGameId || null }))}
          webGames={webGames}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-4 py-3 text-sm text-linear-ink-muted">
          ยังไม่ได้เชื่อมฐานข้อมูลเว็บ TopUp — เพิ่ม connection ชื่อ <code className="font-mono">topup_web</code> ในหน้าตั้งค่า Connections ก่อน
        </p>
      )}
    </div>
  );
}
