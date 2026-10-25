import { CheckCircle2, CircleDashed } from "lucide-react";

// Top of the manage page: what this game still lacks, each a link to the
// card that fixes it.
export default function GameinfoMissingChecklist({ items }) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3.5 text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 size={18} aria-hidden="true" /> ข้อมูลเกมนี้ครบแล้ว
      </p>
    );
  }
  return (
    <section aria-labelledby="missing-title" className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] px-5 py-4">
      <h2 id="missing-title" className="flex items-center gap-2 text-base font-black text-linear-ink">
        <CircleDashed size={18} aria-hidden="true" className="text-amber-600" />
        ข้อมูลที่ยังขาด {items.length} รายการ
      </h2>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.section}`} className="flex h-9 items-center rounded-full border border-amber-500/40 bg-linear-surface-1 px-3.5 text-[13px] font-bold text-linear-ink hover:border-[#D90005] hover:text-[#D90005]">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
