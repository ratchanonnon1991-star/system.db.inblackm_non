import { redirect } from "next/navigation";
import { canManageGameinfo } from "@/server/auth";
import { getSessionUser } from "@/server/session-user";
import { gameinfoSourceSheetId } from "@/server/gameinfo-sheet-import";
import GameinfoSheetImport from "@/components/gameinfo-sheet-import";
import GameinfoSheetPackStatus from "@/components/gameinfo-sheet-pack-status";
import GameinfoBackLink from "@/components/gameinfo-back-link";

export const metadata = { title: "GameInfo — นำเข้าจาก Google Sheet" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!canManageGameinfo(user)) redirect(`/gameinfo/${lang}`);
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${gameinfoSourceSheetId()}/edit`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-7">
      <GameinfoBackLink
        className="mb-5 flex h-10 w-fit items-center gap-1.5 rounded-full border border-linear-hairline bg-linear-surface-1 px-4 text-[13px] font-bold text-linear-ink transition hover:bg-linear-surface-2"
        href={`/gameinfo/${lang}`}
      />
      <h1 className="text-[28px] font-black text-linear-ink">นำเข้าจาก Google Sheet</h1>
      <p className="mb-5 max-w-3xl text-sm text-linear-ink-muted">
        ดึงค่ายเกม หมวดหมู่ ข้อควรระวัง หมายเหตุ ช่องทางขาย/Margin และแพ็ค (พร้อมอัตราต้นทุนสำหรับคิดกำไร) จาก
        {" "}<a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[#D90005] hover:underline">ชีต “1.1 ข้อมูลเติมเกม UID”</a>{" "}
        (แท็บ GAMELIST, List Game เปิด-ปิด และแท็บของแต่ละเกม) เติมเฉพาะช่องที่ GameInfo ยังว่าง จับคู่เกมด้วยชื่อ — แพ็คนำเข้าเฉพาะเกมที่ยังไม่มีแพ็คจริง (โหมด UID) โดยแถวสีแดงเข้ามาเป็นหมดอายุ สีเขียวเป็นใหม่
      </p>
      <div className="flex flex-col gap-8">
        <GameinfoSheetImport lang={lang} sheetUrl={sheetUrl} />
        <GameinfoSheetPackStatus lang={lang} />
      </div>
    </div>
  );
}
