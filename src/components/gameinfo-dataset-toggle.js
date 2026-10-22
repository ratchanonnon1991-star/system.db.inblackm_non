"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function GameinfoDatasetToggle({ basePath }) {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "idpass" ? "idpass" : "uid";
  function href(nextMode) {
    const [path, rawQuery = ""] = basePath.split("?");
    const params = new URLSearchParams(rawQuery);
    if (nextMode === "idpass") params.set("mode", "idpass");
    else params.delete("mode");
    const query = params.toString();
    return `${path}${query ? `?${query}` : ""}`;
  }
  return (
    <div role="group" aria-label="ประเภทการเติม" className="inline-flex gap-1 rounded-full border border-linear-hairline bg-linear-surface-1 p-1 text-[13px]">
      {[['uid', 'UID'], ['idpass', 'IDPASS']].map(([value, label]) => (
        <Link
          key={value}
          href={href(value)}
          prefetch={false}
          aria-current={mode === value ? "true" : undefined}
          className={`flex h-9 items-center rounded-full px-5 font-black tracking-[0.04em] transition ${mode === value ? "bg-[#D90005] text-white" : "text-linear-ink-muted hover:bg-linear-surface-2"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
