import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Gauge, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const items = [
  { id: "mapping", label: "Mapping", path: "market-mapping", icon: Link2 },
  { id: "compare", label: "เทียบราคา", path: "pack-price-compare", icon: ArrowLeftRight },
  { id: "checks", label: "Market Check", path: "market-checks", icon: Gauge },
  { id: "alerts", label: "Alerts", path: "price-alerts", icon: AlertTriangle },
];

export default function GameinfoMarketShell({ lang, active, alertCount = 0, children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">GAMEINFO · MARKET OPERATIONS</p>
            <h1 className="text-2xl font-semibold tracking-tight">ราคาและ Mapping แพ็ค</h1>
          </div>
          <Link href={`/gameinfo/${lang}`} className={cn(buttonVariants({ variant: "outline" }))}>กลับ GameInfo</Link>
        </div>
        <nav className="mx-auto mt-4 flex max-w-[1600px] gap-2 overflow-x-auto" aria-label="Market operations">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.id} href={`/gameinfo/${lang}/${item.path}`} className={cn(buttonVariants({ variant: active === item.id ? "default" : "ghost", size: "sm" }), "shrink-0")}>
                <Icon data-icon="inline-start" /> {item.label}
                {item.id === "alerts" && alertCount > 0 ? <Badge variant="destructive">{alertCount}</Badge> : null}
              </Link>
            );
          })}
        </nav>
      </header>
      <main
        data-shadcn-focus
        className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6"
      >
        {children}
      </main>
    </div>
  );
}
