"use client";

import { useState } from "react";
import { apiJson } from "@/lib/api-json";

// Where this mode's packs are sold from, the part in brackets on the sheet's
// table title. Saved on its own, away from the pack table's save.
export default function GameinfoPackSource({ gameId, dataMode, initial = "" }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState("");

  async function save() {
    const next = value.trim();
    if (next === saved) return;
    setStatus("กำลังบันทึก…");
    try {
      await apiJson(`/api/gameinfo/gamelist/${gameId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [dataMode === "idpass" ? "sourceIdpass" : "sourceUid"]: next }),
      });
      setValue(next);
      setSaved(next);
      setStatus("บันทึกแล้ว");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <label className="mb-4 flex flex-wrap items-center gap-2 text-sm text-linear-ink-muted">
      <span className="font-bold">แหล่งที่มา ({dataMode === "idpass" ? "ID-PASS" : "UID"})</span>
      <input
        value={value}
        maxLength={200}
        onChange={(event) => { setValue(event.target.value); setStatus(""); }}
        onBlur={save}
        placeholder="เช่น Page / Market Place (เว้นว่างได้)"
        className="h-9 min-w-0 flex-1 rounded-lg border border-linear-hairline bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-linear-primary/50 sm:max-w-md"
      />
      {status ? <span role="status" className="text-xs text-linear-ink-tertiary">{status}</span> : null}
    </label>
  );
}
