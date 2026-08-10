"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import GameinfoGamelistTable from "@/components/gameinfo-gamelist-table";
import GameinfoThemeRoot from "@/components/gameinfo-theme-root";
import GameinfoThemeToggle from "@/components/gameinfo-theme-toggle";

export default function GameinfoQueryView({ editable, height, onChanged }) {
  const [rows, setRows] = useState(null);
  const [serverEditable, setServerEditable] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/gamelist", {
        fallbackError: "โหลด GameInfo ไม่สำเร็จ",
      });
      setRows(data.rows);
      setServerEditable(Boolean(data.editable));
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiJson("/api/gameinfo/gamelist", { fallbackError: "โหลด GameInfo ไม่สำเร็จ" })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setServerEditable(Boolean(data.editable));
        setRevision((value) => value + 1);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GameinfoThemeRoot
      className="relative overflow-auto bg-linear-canvas p-3 text-linear-ink"
      style={{ height }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-linear-ink-subtle">
          ฟังก์ชัน GameInfo ใช้ข้อมูลและสิทธิ์ชุดเดียวกับหน้า /gameinfo/th
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <GameinfoThemeToggle />
          <button
            type="button"
            onClick={load}
            className="flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong px-2.5 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2"
          >
            <RefreshCw size={13} /> โหลดใหม่
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </div>
      ) : rows === null ? (
        <p className="flex items-center justify-center gap-2 py-16 text-xs font-semibold text-linear-ink-tertiary">
          <Loader2 size={15} className="animate-spin" /> กำลังโหลด GameInfo...
        </p>
      ) : (
        <GameinfoGamelistTable
          key={revision}
          initial={rows}
          editable={editable && serverEditable}
          lang="th"
          embedded
          onChanged={onChanged}
        />
      )}
    </GameinfoThemeRoot>
  );
}
