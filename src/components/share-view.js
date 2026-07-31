"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { apiJson } from "@/lib/api-json";
import QueryPanel from "@/components/query-panel";

/**
 * The public face of a shared table.
 *
 * It renders the same panel the signed-in app does, so a viewer sees the
 * columns, formats and filters as they were set up rather than a second,
 * slowly diverging table. Everything that writes — cell editing, row deletes,
 * layout saving, snapshots, drill-down — hangs off canManage/canCustomizeLayout,
 * and both are off here. The server enforces the same thing regardless: the
 * only route this page can reach is the read-only share route.
 */
export default function ShareView({ token }) {
  const [query, setQuery] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiJson(`/api/share/${token}`, { fallbackError: "เปิดลิงก์นี้ไม่สำเร็จ" })
      .then((data) => {
        if (!cancelled) setQuery(data.query);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const noop = useCallback(() => {}, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-sm rounded-sm border border-zinc-200 bg-white px-6 py-8 text-center">
          <p className="text-sm font-black text-zinc-700">{error}</p>
          <p className="mt-2 text-xs font-semibold text-zinc-400">
            ลิงก์อาจถูกยกเลิกไปแล้ว ลองขอลิงก์ใหม่จากผู้ดูแล
          </p>
        </div>
      </main>
    );
  }

  if (!query) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="flex items-center gap-2 text-xs font-bold text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> กำลังเปิดตาราง...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-3 lg:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-black text-zinc-800">{query.name}</h1>
            {query.description && (
              <p className="truncate text-xs font-semibold text-zinc-500">
                {query.description}
              </p>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-sm border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-black text-zinc-500">
            <Lock size={11} /> ดูอย่างเดียว
          </span>
        </header>

        <QueryPanel
          query={query}
          queries={[]}
          panel={{ queryId: query.id, width: 0, height: 420 }}
          layoutOverride={query.layout}
          personalLayout={null}
          onPersonalLayoutSaved={noop}
          onLayoutChange={noop}
          onDataChange={noop}
          canManage={false}
          canCustomizeLayout={false}
          isFullWidth
          isSelected={false}
          toolbarHost={null}
          onSelect={noop}
          onDrill={null}
          docked
          canClose={false}
          shareToken={token}
        />

        <p className="text-center text-[10px] font-semibold text-zinc-400">
          GameDB · ลิงก์นี้แสดงข้อมูลอย่างเดียว แก้ไขอะไรไม่ได้
        </p>
      </div>
    </main>
  );
}
