"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { apiJson } from "@/lib/api-json";
import {
  allowGameinfoNavigation,
  hasGameinfoUnsavedChanges,
  requestGameinfoDiscard,
} from "@/lib/gameinfo-unsaved-changes";

export default function GameinfoModeCloneButton({ gameId, currentMode, scope = "all", compact = false }) {
  const [loading, setLoading] = useState(false);
  const sourceMode = currentMode === "idpass" ? "uid" : "idpass";
  const sourceLabel = sourceMode === "uid" ? "UID" : "IDPASS";

  async function performClone() {
    setLoading(true);
    try {
      await apiJson(`/api/gameinfo/gamelist/${gameId}/clone-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMode, targetMode: currentMode, scope }),
        fallbackError: "clone ชุดข้อมูลไม่สำเร็จ",
      });
      allowGameinfoNavigation();
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "clone ชุดข้อมูลไม่สำเร็จ");
      setLoading(false);
    }
  }

  function clone() {
    const targetLabel = currentMode === "idpass" ? "IDPASS" : "UID";
    if (!window.confirm(`แทนที่ข้อมูล ${scope === "packs" ? "Packs " : ""}${targetLabel} ด้วยข้อมูลจาก ${sourceLabel} ใช่ไหม?`)) return;
    if (hasGameinfoUnsavedChanges()) {
      requestGameinfoDiscard({
        title: "ละทิ้งข้อมูลแล้ว Clone?",
        message: "การแก้ไขที่ยังไม่บันทึกในหน้านี้จะหายไปก่อนโหลดข้อมูลที่ Clone",
        confirmLabel: "ละทิ้งและ Clone",
        onConfirm: performClone,
      });
      return;
    }
    void performClone();
  }
  return (
    <button type="button" onClick={clone} disabled={loading} className={compact ? "flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs text-linear-ink hover:bg-linear-surface-2 disabled:opacity-50" : "flex h-9 items-center gap-1 rounded-lg border border-linear-hairline-strong px-3 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-50"}>
      <Copy size={13} /> {loading ? "กำลัง Clone..." : `Clone จาก ${sourceLabel}`}
    </button>
  );
}
