"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Tag } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";

// Landing view for "ตั้งราคาขายตามแพ็ก": just the platform cards (same
// tile-grid look as the hub's System DB / GameInfo / Projectm / Profit
// tiles) plus one to add another -- click a card to drill into that
// platform's own price table at /profit/sale-prices/[platform].
export default function ProfitSalePricesPage() {
  const canEdit = useProfitCanEdit();
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [addingPlatform, setAddingPlatform] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");

  const load = useCallback(() => {
    apiJson("/api/profit/sale-prices/summary", { fallbackError: "โหลดภาพรวมแพลตฟอร์มไม่สำเร็จ" })
      .then((res) => setSummary(res))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goToPlatform = (name) => {
    router.push(`/profit/sale-prices/${encodeURIComponent(name)}`);
  };

  const confirmNewPlatform = () => {
    const name = newPlatformName.trim();
    if (!name) return;
    goToPlatform(name);
  };

  if (error) {
    return <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-sm text-ll-primary-subtle-text">เกิดข้อผิดพลาด: {error}</div>;
  }
  if (!summary) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ll-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/profit"
        className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-ll-ink-subtle hover:text-ll-ink"
      >
        <ArrowLeft size={13} /> กลับภาพรวม
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">ตั้งราคาขายตามแพ็ก</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ll-ink-subtle">
          ราคาขายแต่ละแพลตฟอร์ม (Kaleoz, USDT Russia ฯลฯ) ไม่เท่ากัน — เลือกแพลตฟอร์มด้านล่างเพื่อดู/ตั้งราคาขายของแพลตฟอร์มนั้น
          เป็น<b className="text-ll-ink">ตารางอ้างอิง</b>ให้เปิดดูก่อนพิมพ์ราคาขายจริงในออเดอร์เอง ไม่ได้เติมราคาให้อัตโนมัติ
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.platforms.map((p) => (
          <button
            key={p.platform}
            type="button"
            onClick={() => goToPlatform(p.platform)}
            className="flex items-center gap-3 rounded-lg border border-ll-hairline bg-ll-surface-1 p-4 text-left shadow-[var(--ll-shadow-card)] transition hover:border-ll-hairline-strong hover:bg-ll-surface-2"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Tag size={19} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-ll-ink">{p.platform}</span>
              <span className="mt-0.5 block text-[12px] text-ll-ink-subtle">
                ตั้งราคาแล้ว {p.pricedCount}/{summary.totalPacks} แพ็ก
              </span>
            </span>
          </button>
        ))}

        {canEdit && (
          addingPlatform ? (
            <div className="flex flex-col justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 p-4">
              <input
                autoFocus
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmNewPlatform()}
                placeholder="ชื่อแพลตฟอร์ม เช่น Kaleoz"
                className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmNewPlatform}
                  disabled={!newPlatformName.trim()}
                  className="h-8 flex-1 rounded-md bg-ll-primary text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
                >
                  ไปตั้งราคา
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingPlatform(false); setNewPlatformName(""); }}
                  className="h-8 rounded-md border border-ll-hairline-strong px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingPlatform(true)}
              className="flex min-h-[76px] items-center justify-center gap-2 rounded-lg border border-dashed border-ll-hairline-strong p-4 text-[13px] font-medium text-ll-ink-subtle transition hover:border-ll-primary hover:text-ll-primary-subtle-text"
            >
              <Plus size={16} /> เพิ่มแพลตฟอร์มใหม่
            </button>
          )
        )}

        {!summary.platforms.length && !canEdit && (
          <p className="col-span-full py-10 text-center text-[13px] text-ll-ink-subtle">ยังไม่มีแพลตฟอร์ม</p>
        )}
      </div>
    </div>
  );
}
