import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Boxes, Landmark, Smartphone, Wallet, CreditCard } from "lucide-react";
import { TOPUP_INVENTORY_PROVIDERS, topupInventoryPath } from "@/lib/topup-inventory";

const icons = { netease: Wallet, "garena-shell": Wallet, itune: Wallet, moniepoint: Landmark, wavepay: Smartphone, usdcodashop: Boxes, multigamecard: CreditCard };
const cardClass = "flex min-w-0 flex-col gap-5 rounded-xl border border-ll-hairline bg-ll-surface-1 p-5 text-ll-ink shadow-[var(--ll-shadow-card)]";

export default function TopupInventoryHome({ lang }) {
  return <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 pb-14 pt-10 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-4 pr-12">
      <div className="min-w-0 space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-ll-ink-tertiary">PROJECTM</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ll-ink">Topup Inventory</h1>
        <p className="text-sm text-ll-ink-subtle">ศูนย์รวม Inventory สำหรับงานเติมเกม เลือกบริการที่ต้องการใช้งาน</p>
      </div>
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ll-hairline-strong px-3 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary"><ArrowLeft size={16} aria-hidden />กลับเมนูหลัก</Link>
    </header>
    <section aria-label="บริการ Topup Inventory" className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TOPUP_INVENTORY_PROVIDERS.map((provider) => {
        const Icon = icons[provider.key] || Boxes;
        const content = <>
          <div className="flex items-center justify-between gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-ll-surface-2 text-ll-ink-subtle"><Icon size={22} aria-hidden /></span>
            <span className={`rounded-full px-2 py-1 text-xs ${provider.ready ? "bg-ll-primary text-ll-on-primary" : "bg-ll-surface-2 text-ll-ink-subtle"}`}>{provider.ready ? "พร้อมใช้งาน" : "เร็ว ๆ นี้"}</span>
          </div>
          <div className="min-w-0 flex-1 space-y-2"><h2 className="break-words text-xl font-semibold">{provider.name}</h2><p className="text-sm leading-relaxed text-ll-ink-subtle">{provider.description}</p></div>
          <span className="flex min-h-11 items-center justify-between gap-2 border-t border-ll-hairline pt-3 text-sm font-medium">{provider.ready ? "เข้าใช้งาน" : "ยังไม่เปิดให้ใช้งาน"}{provider.ready && <ArrowUpRight size={17} aria-hidden />}</span>
        </>;
        return provider.ready
          ? <Link key={provider.key} href={`${topupInventoryPath(lang)}/${provider.key}`} className={`${cardClass} hover:border-ll-hairline-strong hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary`}>{content}</Link>
          : <article key={provider.key} data-inventory-state="coming-soon" className={cardClass}>{content}</article>;
      })}
    </section>
    <p className="rounded-xl border border-dashed border-ll-hairline-strong p-4 text-sm text-ll-ink-subtle">รองรับการเพิ่มบริการ Inventory อื่น ๆ ในอนาคต โดยแยกการจัดการของแต่ละบริการออกจากกัน</p>
  </main>;
}
