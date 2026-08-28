"use client";

import {
  GAMEINFO_FORMULA_FUNCTION_HELP,
  GAMEINFO_ROUNDING_HELP,
  GAMEINFO_ROUNDING_NOTE,
} from "@/lib/gameinfo-formula-help";

export default function GameinfoFormulaHelpPanel() {
  return (
    <div className="flex flex-col gap-2">
      <details className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
        <summary className="cursor-pointer text-xs font-medium text-linear-ink-muted">
          ฟังก์ชันที่ใช้ได้
        </summary>
        <dl className="mt-2 flex flex-col gap-1">
          {GAMEINFO_FORMULA_FUNCTION_HELP.map(([group, list]) => (
            <div key={group} className="flex gap-2 text-xs leading-relaxed">
              <dt className="w-12 shrink-0 text-linear-ink-tertiary">{group}</dt>
              <dd className="min-w-0 font-mono text-linear-ink-subtle">{list}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
        <summary className="cursor-pointer text-xs font-medium text-linear-ink-muted">
          วิธีใช้สูตรปัดเลข
        </summary>
        <dl className="mt-2 flex flex-col gap-2">
          {GAMEINFO_ROUNDING_HELP.map(([signature, purpose, example]) => (
            <div key={signature} className="text-xs leading-relaxed">
              <dt className="font-mono text-linear-ink-subtle">{signature}</dt>
              <dd className="text-linear-ink-tertiary">
                {purpose}<span className="ml-1.5 font-mono text-linear-primary">{example}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 border-t border-linear-hairline pt-2 text-[11px] text-linear-ink-tertiary">
          {GAMEINFO_ROUNDING_NOTE}
        </p>
      </details>
    </div>
  );
}
