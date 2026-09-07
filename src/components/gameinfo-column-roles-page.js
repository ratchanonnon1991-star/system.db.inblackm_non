"use client";

import { useMemo, useState } from "react";
import { Check, LoaderCircle, Lock } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import {
  GAMEINFO_COLUMN_ROLES,
  GAMEINFO_COLUMN_ROLE_ALL_GAMES,
  hiddenGameinfoColumnKeys,
} from "@/lib/gameinfo-column-roles";

const ROLE_LABELS = { admin: "Admin", topup: "Topup" };

export default function GameinfoColumnRolesPage({ columns, rules: initialRules, games }) {
  const [rules, setRules] = useState(initialRules);
  const [gameId, setGameId] = useState(GAMEINFO_COLUMN_ROLE_ALL_GAMES);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const everyGame = Number(gameId) === GAMEINFO_COLUMN_ROLE_ALL_GAMES;
  // What each role would actually see with the rules as they stand, resolved
  // by the same function the pack pages use so this screen cannot disagree
  // with them about precedence.
  const hiddenByRole = useMemo(
    () =>
      Object.fromEntries(
        GAMEINFO_COLUMN_ROLES.map((role) => [role, hiddenGameinfoColumnKeys(rules, role, gameId)])
      ),
    [rules, gameId]
  );

  async function setVisible(role, columnKey, visible) {
    const hidden = new Set(hiddenByRole[role]);
    if (visible) hidden.delete(columnKey);
    else hidden.add(columnKey);

    // In one game, "visible" has to be written down rather than left out: it
    // is the only way to overrule a column hidden across every game.
    const shown = everyGame
      ? []
      : columns
          .map((column) => column.key)
          .filter((key) => !hidden.has(key) && hiddenGameinfoColumnKeys(rules, role, GAMEINFO_COLUMN_ROLE_ALL_GAMES).has(key));

    setSaving(`${role}:${columnKey}`);
    setError("");
    setSaved("");
    try {
      const result = await apiJson("/api/gameinfo/column-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          gameId: Number(gameId),
          hiddenColumnKeys: [...hidden],
          shownColumnKeys: shown,
        }),
        fallbackError: "บันทึกสิทธิ์คอลัมน์ไม่สำเร็จ",
      });
      setRules(result.rules);
      setSaved(`${role}:${columnKey}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "บันทึกสิทธิ์คอลัมน์ไม่สำเร็จ");
    } finally {
      setSaving("");
    }
  }

  if (!columns.length) {
    return (
      <p className="rounded-xl border border-linear-hairline bg-linear-surface-2 p-4 text-sm text-linear-ink-muted">
        ยังไม่มีคอลัมน์ที่สร้างเอง — สร้างคอลัมน์ในหน้าแก้ไขแพ็กหรือนำเข้าด้วย CSV ก่อน
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="scope" className="text-sm text-linear-ink-muted">ขอบเขต</label>
        <select
          id="scope"
          value={gameId}
          onChange={(event) => setGameId(Number(event.target.value))}
          className="h-9 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink"
        >
          <option value={GAMEINFO_COLUMN_ROLE_ALL_GAMES}>ทุกเกม (ค่ากลาง)</option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>{game.game}</option>
          ))}
        </select>
        <p className="text-xs text-linear-ink-tertiary">
          {everyGame
            ? "ตั้งค่านี้ใช้กับทุกเกมที่ไม่ได้ตั้งเฉพาะไว้"
            : "ตั้งเฉพาะเกมนี้ — จะทับค่ากลางเฉพาะเกมนี้เท่านั้น"}
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-linear-hairline">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-linear-hairline bg-linear-surface-2 text-left">
              <th className="px-4 py-2.5 font-medium text-linear-ink">คอลัมน์</th>
              {GAMEINFO_COLUMN_ROLES.map((role) => (
                <th key={role} className="w-28 px-4 py-2.5 text-center font-medium text-linear-ink">
                  {ROLE_LABELS[role] || role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.key} className="border-b border-linear-hairline last:border-0">
                <td className="px-4 py-2.5 text-linear-ink-muted">{column.label}</td>
                {GAMEINFO_COLUMN_ROLES.map((role) => {
                  const busy = saving === `${role}:${column.key}`;
                  const justSaved = saved === `${role}:${column.key}`;
                  return (
                    <td key={role} className="px-4 py-2.5 text-center">
                      <label className="inline-flex items-center justify-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={!hiddenByRole[role].has(column.key)}
                          disabled={Boolean(saving)}
                          onChange={(event) => setVisible(role, column.key, event.target.checked)}
                          className="accent-linear-primary"
                        />
                        {busy ? <LoaderCircle size={12} className="animate-spin text-linear-ink-tertiary" /> : null}
                        {justSaved && !busy ? <Check size={12} className="text-emerald-500" /> : null}
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-linear-warning/40 bg-linear-warning-bg p-3 text-xs text-linear-warning">
        <Lock size={14} className="mt-0.5 shrink-0" />
        <span>
          การตั้งค่านี้ซ่อนคอลัมน์บนหน้าจอเท่านั้น API ของแพ็กยังส่งข้อมูลครบ
          ใช้จัดหน้าจอให้ตรงกับงานของแต่ละ role ไม่ใช่การกันข้อมูลลับ
        </span>
      </p>
    </div>
  );
}
