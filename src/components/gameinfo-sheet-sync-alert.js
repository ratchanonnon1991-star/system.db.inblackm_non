import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatGameinfoSheetSyncTime, gameinfoSheetSyncProblem } from "@/lib/gameinfo-sheet-packs";

const MESSAGES = {
  failed: (time) => `ระบบอ่านชีตรอบ ${time} ไม่สำเร็จ ไม่ได้ปรับสถานะแพ็คเลย`,
  partial: (time, run) => `ระบบอ่านชีตรอบ ${time} ไม่สำเร็จ ${run.failed} เกม`,
  late: (time) => `ระบบไม่ได้อ่านชีตตามเวลา รอบล่าสุดคือ ${time}`,
};

/** Above every GameInfo page for those who can act on it, until a later run comes through clean. */
export default function GameinfoSheetSyncAlert({ lang, run }) {
  const problem = gameinfoSheetSyncProblem(run);
  if (!problem) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-[#B80004] sm:px-6 dark:text-[#FF8A8C]">
      <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1 font-bold">{MESSAGES[problem](formatGameinfoSheetSyncTime(run.finishedAt), run)} — สถานะและวันหมดอายุของแพ็คอาจไม่ตรงกับชีต</span>
      <Link href={`/gameinfo/${lang}/sheet-import`} className="shrink-0 font-black underline">ดูรายละเอียด</Link>
    </div>
  );
}
